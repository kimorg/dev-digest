import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SmartDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const ROLES = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

d('Smart diff module (Testcontainers pg)', () => {
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
  async function newPr(files: { path: string; additions: number; deletions: number }[]) {
    const name = `smart-diff-${seq++}`;
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
        title: 'T',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'sha-1',
        body: '',
      })
      .returning();
    if (files.length > 0) {
      await pg.handle.db.insert(t.prFiles).values(files.map((f) => ({ prId: pr!.id, ...f, patch: null })));
    }
    return pr!;
  }

  async function review(prId: string, agentId: string | null, kind: 'review' | 'summary', createdAt: Date) {
    const [r] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind, createdAt })
      .returning();
    return r!;
  }

  const finding = (reviewId: string, file: string, startLine: number, dismissedAt?: Date) => ({
    reviewId,
    file,
    startLine,
    endLine: startLine,
    severity: 'WARNING',
    category: 'bug',
    title: `f-${file}-${startLine}`,
    rationale: 'r',
    confidence: 0.9,
    dismissedAt: dismissedAt ?? null,
  });

  const get = (app: Awaited<ReturnType<typeof appWith>>, id: string) =>
    app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });

  it('PR without reviews: 5 groups in display order, sorted files, empty finding_lines, no model call', async () => {
    const llm = new MockLLMProvider('openai', { structured: {} });
    const app = await appWith(llm);
    const pr = await newPr([
      { path: 'src/b.ts', additions: 3, deletions: 1 },
      { path: 'src/a.ts', additions: 4, deletions: 0 },
      { path: 'README.md', additions: 1, deletions: 0 },
      { path: 'package.json', additions: 1, deletions: 1 },
    ]);
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(ROLES);
    expect(body.groups[0]!.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(body.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 11, proposed_splits: [] });
    expect(llm.calls.length).toBe(0);
    await app.close();
  });

  it('counts only the latest review-kind review per agent and skips dismissed findings', async () => {
    const llm = new MockLLMProvider('openai', { structured: {} });
    const app = await appWith(llm);
    const pr = await newPr([
      { path: 'src/a.ts', additions: 1, deletions: 0 },
      { path: 'src/b.ts', additions: 1, deletions: 0 },
    ]);
    const agentA = randomUUID();
    const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));
    const aOld = await review(pr.id, agentA, 'review', at(1));
    const aNew = await review(pr.id, agentA, 'review', at(5));
    const none = await review(pr.id, null, 'review', at(3));
    const summary = await review(pr.id, agentA, 'summary', at(9));
    await pg.handle.db.insert(t.findings).values([
      finding(aOld.id, 'src/a.ts', 99),
      finding(aNew.id, 'src/a.ts', 20),
      finding(aNew.id, 'src/a.ts', 7),
      finding(aNew.id, 'src/b.ts', 50, new Date()),
      finding(none.id, 'src/b.ts', 3),
      finding(summary.id, 'src/b.ts', 77),
    ]);
    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    const files = SmartDiff.parse(res.json()).groups[0]!.files;
    expect(files.find((f) => f.path === 'src/a.ts')!.finding_lines).toEqual([7, 20]);
    expect(files.find((f) => f.path === 'src/b.ts')!.finding_lines).toEqual([3]);
    expect(llm.calls.length).toBe(0);
    await app.close();
  });

  it('unknown PR id is a 404', async () => {
    const app = await appWith(new MockLLMProvider('openai', { structured: {} }));
    const res = await get(app, randomUUID());
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
