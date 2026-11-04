import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrHistory, type AssociatedPullRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const merged = (n: number): AssociatedPullRef => ({
  number: n,
  title: `Earlier PR ${n}`,
  author: 'dev',
  merged_at: `2026-02-${String(n).padStart(2, '0')}T00:00:00Z`,
});

d('PR history module (Testcontainers pg)', () => {
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

  function appWith(github: MockGitHubClient) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
        github,
      },
    });
  }

  async function newPr(files: string[]) {
    const name = `history-${randomUUID().slice(0, 8)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 50,
        title: 'T',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'sha-1',
        body: '',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0, patch: null })));
    return pr!;
  }

  it('returns at most 5 merged PRs from the GitHub mock, without the current PR', async () => {
    const github = new MockGitHubClient({
      commitShas: { 'src/a.ts': ['c1', 'c2'], 'src/b.ts': ['c3'] },
      pullsForCommit: {
        c1: [merged(1), merged(2), merged(3)],
        c2: [merged(4), { ...merged(5), merged_at: null }],
        c3: [merged(6), merged(7), merged(50)],
      },
    });
    const app = await appWith(github);
    const pr = await newPr(['src/a.ts', 'src/b.ts']);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(200);
    const body = PrHistory.parse(res.json());
    expect(body.degraded).toBe(false);
    expect(body.history.length).toBeLessThanOrEqual(5);
    expect(body.history.map((h) => h.pr_number)).not.toContain(50);
    expect(body.history.map((h) => h.pr_number)).not.toContain(5);
    expect(body.history[0]!.files_overlap.length).toBeGreaterThan(0);
    await app.close();
  });

  it('unknown PR is a 404', async () => {
    const app = await appWith(new MockGitHubClient());
    expect((await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/history` })).statusCode).toBe(404);
    await app.close();
  });
});
