import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { ContextDocSource } from '../src/modules/project-context/ports.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = (nodeEnv: 'test' | 'development' = 'test') =>
  loadConfig({ ...process.env, NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);

const FIXTURE = {
  summary: 'Adds a limiter.',
  risks: [
    { kind: 'security', title: 'Bypass', explanation: 'e', severity: 'high', file_refs: ['src/a.ts:3', 'ghost.ts'] },
    { kind: 'data', title: 'Invented', explanation: 'e', severity: 'low', file_refs: ['ghost.ts'] },
  ],
  review_focus: [
    { file: 'src/a.ts', line: 5, reason: 'start here' },
    { file: 'ghost.ts', line: 1, reason: 'invented' },
    { file: 'src/a.ts', line: 0, reason: 'zero' },
  ],
};

const completeCalls = (llm: MockLLMProvider) =>
  llm.calls.filter((c) => c.method === 'completeStructured');

class CountingGitHub extends MockGitHubClient {
  issueCalls = 0;
  override async getIssue(...args: Parameters<MockGitHubClient['getIssue']>) {
    this.issueCalls++;
    return super.getIssue(...args);
  }
}

d('PR brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const apps: { close(): Promise<unknown> }[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
    await pg?.stop();
  });

  async function mkApp(opts: {
    llm?: MockLLMProvider;
    github?: MockGitHubClient;
    nodeEnv?: 'test' | 'development';
    contextDocSource?: ContextDocSource;
    noKeys?: boolean;
  }) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structured: FIXTURE });
    const app = await buildApp({
      config: config(opts.nodeEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        github: opts.github ?? new MockGitHubClient(),
        ...(opts.noKeys
          ? { secrets: { get: async () => undefined } }
          : { llm: { openai: llm, openrouter: new MockLLMProvider('openai', { structured: FIXTURE }) } }),
        ...(opts.contextDocSource ? { contextDocSource: opts.contextDocSource } : {}),
      },
    });
    apps.push(app);
    return { app, llm };
  }

  let seq = 0;
  async function newPr(over: { body?: string; ws?: string; clonePath?: string | null; patch?: string } = {}) {
    const name = `brief-${seq++}`;
    const ws = over.ws ?? workspaceId;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: ws,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: over.clonePath === undefined ? null : over.clonePath,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 1,
        title: 'Add limiter',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'sha-1',
        body: over.body ?? 'plain body',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/a.ts', additions: 4, deletions: 1, patch: over.patch ?? null },
      { prId: pr!.id, path: 'src/b.ts', additions: 2, deletions: 0 },
    ]);
    return pr!;
  }

  type A = Awaited<ReturnType<typeof mkApp>>['app'];
  const get = (app: A, id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
  const post = (app: A, id: string) => app.inject({ method: 'POST', url: `/pulls/${id}/brief` });
  const rowOf = async (prId: string) =>
    (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0];

  it('GET with no brief → 200 {brief:null, stale:false}, with no model or GitHub call (AC-1, AC-2, NFR-3)', async () => {
    const github = new CountingGitHub();
    const { app, llm } = await mkApp({ github });
    const pr = await newPr({ body: 'Fixes #7' });
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false });
    expect(completeCalls(llm)).toHaveLength(0);
    expect(github.issueCalls).toBe(0);
  });

  it('unknown PR and a PR of another workspace → 404 not_found on GET and POST (AC-3, AC-4)', async () => {
    const { app, llm } = await mkApp({});
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await newPr({ ws: otherWs!.id });
    for (const id of [randomUUID(), foreign.id]) {
      for (const send of [get, post]) {
        const res = await send(app, id);
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
    }
    expect(completeCalls(llm)).toHaveLength(0);
  });

  it('POST generates with gpt-4.1, grounds the output, upserts with head_sha, then GET is fresh and goes stale (AC-5…AC-8, AC-16, AC-25…AC-28)', async () => {
    const { app, llm } = await mkApp({});
    const pr = await newPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stale).toBe(false);
    expect(body.brief.head_sha).toBe('sha-1');
    expect(body.brief.model).toBe('gpt-4.1');
    expect(body.brief.provider).toBe('openai');
    expect(body.brief.intent).toBeNull();
    expect(body.brief.risks.risks).toHaveLength(1);
    expect(body.brief.risks.risks[0].file_refs).toEqual(['src/a.ts:3']);
    expect(body.brief.review_focus).toEqual([{ file: 'src/a.ts', line: 5, reason: 'start here' }]);

    const calls = completeCalls(llm);
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as { model: string; timeoutMs: number };
    expect(req.model).toBe('gpt-4.1');
    expect(req.timeoutMs).toBe(60_000);

    expect(await rowOf(pr.id)).toBeDefined();
    const fresh = (await get(app, pr.id)).json();
    expect(fresh.stale).toBe(false);
    expect(fresh.brief.summary).toBe('Adds a limiter.');
    expect(completeCalls(llm)).toHaveLength(1);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-2' }).where(eq(t.pullRequests.id, pr.id));
    const stale = (await get(app, pr.id)).json();
    expect(stale.stale).toBe(true);
    expect(stale.brief.head_sha).toBe('sha-1');
  });

  it('a second POST on a fresh brief regenerates (AC-9)', async () => {
    const { app, llm } = await mkApp({});
    const pr = await newPr();
    await post(app, pr.id);
    await post(app, pr.id);
    expect(completeCalls(llm)).toHaveLength(2);
  });

  it('two parallel POSTs → both 200 with the same generated_at, one model call (AC-10, EC-2)', async () => {
    const { app, llm } = await mkApp({});
    const pr = await newPr();
    const [a, b] = await Promise.all([post(app, pr.id), post(app, pr.id)]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json().brief.generated_at).toBe(b.json().brief.generated_at);
    expect(completeCalls(llm)).toHaveLength(1);
  });

  it('corrupt stored json → GET brief:null (EC-3)', async () => {
    const { app } = await mkApp({});
    const pr = await newPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { nonsense: true } });
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null, stale: false });
  });

  it('workspace model choice is used and recorded (AC-15)', async () => {
    const { app, llm } = await mkApp({});
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { risk_brief: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } } },
    });
    expect(put.statusCode).toBe(200);
    const pr = await newPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.provider).toBe('openrouter');
    expect(res.json().brief.model).toBe('z-ai/glm-4.7-flash');
    expect(completeCalls(llm)).toHaveLength(0); // the openai provider was not used
    await app.inject({ method: 'PUT', url: '/settings', payload: { feature_models: {} } });
  });

  it('no API key → 500 config_error and the stored row is unchanged (AC-11)', async () => {
    const { app } = await mkApp({ noKeys: true });
    const pr = await newPr();
    const before = { prId: pr.id, json: { nonsense: 'kept' } };
    await pg.handle.db.insert(t.prBrief).values(before);
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('config_error');
    expect(await rowOf(pr.id)).toEqual(before);
  });

  it('a fixture failing PrBriefModelResult → 502 and no row (AC-13)', async () => {
    const llm = new MockLLMProvider('openai', { structured: { summary: 42 } });
    const { app } = await mkApp({ llm });
    const pr = await newPr();
    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('external_service_error');
    expect(await rowOf(pr.id)).toBeUndefined();
  });

  it('patch text never reaches the model; a huge PR body keeps the input ≤ 40 000 chars (AC-18, AC-19, NFR-1)', async () => {
    const { app, llm } = await mkApp({});
    const pr = await newPr({
      body: 'B'.repeat(200_000),
      patch: '@@ -1,1 +1,2 @@\n+PATCH_MARKER_LINE_XYZ\n',
    });
    expect((await post(app, pr.id)).statusCode).toBe(200);
    const req = completeCalls(llm)[0]!.req as { messages: { content: string }[] };
    const all = req.messages.map((m) => m.content).join('\n');
    expect(all).not.toContain('PATCH_MARKER_LINE_XYZ');
    expect(all).toContain('src/a.ts +4 −1');
    expect(all.length).toBeLessThanOrEqual(40_000);
  });

  it('documents come from the newest run of each agent via specs_read, deduped (AC-20, AC-21)', async () => {
    const reads: string[] = [];
    const contextDocSource: ContextDocSource = {
      exists: async () => true,
      list: async () => [],
      read: async (_root, path) => {
        reads.push(path);
        return path === 'gone.md'
          ? { status: 'missing' }
          : { status: 'ok', content: `DOC<${path}>`, sizeBytes: 10 };
      },
    };
    const { app, llm } = await mkApp({ contextDocSource });
    const pr = await newPr({ clonePath: '/fake/clone' });
    const agentA = randomUUID();
    const mkRun = async (specs: string[] | null, agentId: string, at: string) => {
      const [run] = await pg.handle.db
        .insert(t.agentRuns)
        .values({ workspaceId, agentId: null, prId: pr.id })
        .returning();
      if (specs) await pg.handle.db.insert(t.runTraces).values({ runId: run!.id, trace: { specs_read: specs } });
      await pg.handle.db.insert(t.reviews).values({
        workspaceId,
        prId: pr.id,
        agentId,
        runId: run!.id,
        kind: 'review',
        createdAt: new Date(at),
      });
    };
    await mkRun(['old-only.md'], agentA, '2026-01-01T00:00:00Z'); // superseded run of agent A
    await mkRun(['new.md', 'gone.md'], agentA, '2026-02-01T00:00:00Z');
    await mkRun(['new.md', 'other.md'], randomUUID(), '2026-01-15T00:00:00Z');
    await mkRun(null, randomUUID(), '2026-01-10T00:00:00Z'); // no trace → skipped

    expect((await post(app, pr.id)).statusCode).toBe(200);
    const req = completeCalls(llm)[0]!.req as { messages: { content: string }[] };
    const user = req.messages.map((m) => m.content).join('\n');
    expect(user).toContain('DOC<new.md>');
    expect(user).toContain('DOC<other.md>');
    expect(user).not.toContain('old-only.md');
    expect(user).not.toContain('gone.md');
    expect(reads.filter((p) => p === 'new.md')).toHaveLength(1);
  });

  it('the 11th POST in a minute and the 31st GET are 429 rate_limited (AC-14)', async () => {
    const { app } = await mkApp({ nodeEnv: 'development' });
    const pr = await newPr();
    const posts: number[] = [];
    let last: { error: { code: string } } | undefined;
    for (let i = 0; i < 11; i++) {
      const res = await post(app, pr.id);
      posts.push(res.statusCode);
      last = res.json();
    }
    expect(posts.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(posts[10]).toBe(429);
    expect(last!.error.code).toBe('rate_limited');

    const gets: number[] = [];
    for (let i = 0; i < 31; i++) gets.push((await get(app, pr.id)).statusCode);
    expect(gets.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(gets[30]).toBe(429);
  });
});
