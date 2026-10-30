import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const INTENT = {
  intent: 'Add rate limiting to public endpoints',
  in_scope: ['limiter'],
  out_of_scope: ['quotas'],
};

const llmCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured').length;

d('Intent module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), llm: { openai: llm } },
    });
  }

  let seq = 0;
  async function newPr(body: string) {
    const name = `intent-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'sha-1',
        body,
      })
      .returning();
    return pr!;
  }

  const get = (app: Awaited<ReturnType<typeof appWith>>, id: string) =>
    app.inject({ method: 'GET', url: `/pulls/${id}/intent` });
  const recalc = (app: Awaited<ReturnType<typeof appWith>>, id: string) =>
    app.inject({ method: 'POST', url: `/pulls/${id}/intent/recalculate` });

  it('seeded PR #482: GET returns the stored intent, not stale, with no model call', async () => {
    const llm = new MockLLMProvider('openai', { structured: INTENT });
    const app = await appWith(llm);
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const res = await get(app, pr!.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().stale).toBe(false);
    expect(res.json().intent.intent).toContain('rate limiting');
    expect(llmCalls(llm)).toBe(0);
    await app.close();
  });

  it('GET never generates; recalculate generates once, then reuses; PR/model changes make it stale', async () => {
    const llm = new MockLLMProvider('openai', { structured: INTENT });
    const app = await appWith(llm);
    const pr = await newPr('Add rate limiting to the public API so unauthenticated clients cannot hammer the endpoints.');

    // No stored intent → null, and still no model call.
    let view = (await get(app, pr.id)).json();
    expect(view).toEqual({ intent: null, stale: false });
    expect(llmCalls(llm)).toBe(0);

    // Recalculate generates (1 call), a second one reuses (0 more).
    const first = (await recalc(app, pr.id)).json();
    expect(first.regenerated).toBe(true);
    expect(first.intent.confidence).toBe('medium');
    expect(first.intent.provider).toBe('openai');
    expect(llmCalls(llm)).toBe(1);
    const second = (await recalc(app, pr.id)).json();
    expect(second.regenerated).toBe(false);
    expect(llmCalls(llm)).toBe(1);

    view = (await get(app, pr.id)).json();
    expect(view.stale).toBe(false);
    expect(view.intent.in_scope).toEqual(['limiter']);

    // head_sha moved → stale on GET (still no call), then regenerated.
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-2' }).where(eq(t.pullRequests.id, pr.id));
    expect((await get(app, pr.id)).json().stale).toBe(true);
    expect(llmCalls(llm)).toBe(1);
    expect((await recalc(app, pr.id)).json().regenerated).toBe(true);
    expect(llmCalls(llm)).toBe(2);

    // body changed → stale.
    await pg.handle.db.update(t.pullRequests).set({ body: 'Different body' }).where(eq(t.pullRequests.id, pr.id));
    expect((await get(app, pr.id)).json().stale).toBe(true);
    await recalc(app, pr.id);
    expect((await get(app, pr.id)).json().stale).toBe(false);

    // model changed in Settings → stale.
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'openai', model: 'gpt-4.1-mini' } } },
    });
    expect(put.statusCode).toBe(200);
    expect((await get(app, pr.id)).json().stale).toBe(true);
    const after = (await recalc(app, pr.id)).json();
    expect(after.regenerated).toBe(true);
    expect(after.intent.model).toBe('gpt-4.1-mini');
    await app.close();
  });

  it('parallel recalculations share one in-flight generation', async () => {
    const llm = new MockLLMProvider('openai', { structured: INTENT });
    const app = await appWith(llm);
    const pr = await newPr('Add rate limiting');
    const [a, b] = await Promise.all([recalc(app, pr.id), recalc(app, pr.id)]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(llmCalls(llm)).toBe(1);
    await app.close();
  });

  it('404 for a PR that does not exist in this workspace', async () => {
    const app = await appWith(new MockLLMProvider('openai', { structured: INTENT }));
    expect((await get(app, randomUUID())).statusCode).toBe(404);
    expect((await recalc(app, randomUUID())).statusCode).toBe(404);
    await app.close();
  });
});
