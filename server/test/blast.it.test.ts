import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BlastRadius } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('Blast module (Testcontainers pg)', () => {
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

  function appWith(llm: MockLLMProvider, result: BlastResult, calls: { repoId: string; files: string[] }[]) {
    const repoIntel = {
      getBlastRadius: async (repoId: string, files: string[]) => {
        calls.push({ repoId, files });
        return result;
      },
    } as unknown as RepoIntel;
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), llm: { openai: llm }, repoIntel },
    });
  }

  async function newPr(files: string[]) {
    const name = `blast-${randomUUID().slice(0, 8)}`;
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
    await pg.handle.db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0, patch: null })));
    return { pr: pr!, repoId: repo!.id };
  }

  it('maps the facade result once, with the PR repo and files; no model call', async () => {
    const llm = new MockLLMProvider('openai', { structured: {} });
    const calls: { repoId: string; files: string[] }[] = [];
    const app = await appWith(
      llm,
      {
        changedSymbols: [{ file: 'src/a.ts', name: 'alpha', kind: 'function' }],
        callers: [{ file: 'src/b.ts', symbol: 'handler', viaSymbol: 'alpha', line: 9, rank: 0.5 }],
        impactedEndpoints: ['GET /x'],
        factsByFile: { 'src/b.ts': { endpoints: ['GET /x'], crons: [] } },
        degraded: false,
      },
      calls,
    );
    const { pr, repoId } = await newPr(['src/a.ts', 'src/c.ts']);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadius.parse(res.json());
    expect(body.downstream[0]!.callers[0]).toEqual({ name: 'handler', file: 'src/b.ts', line: 9 });
    expect(body.downstream[0]!.endpoints_affected).toEqual(['GET /x']);
    expect(body.degraded).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.repoId).toBe(repoId);
    expect([...calls[0]!.files].sort()).toEqual(['src/a.ts', 'src/c.ts']);
    expect(llm.calls.length).toBe(0);
    await app.close();
  });

  it('passes a degraded result through', async () => {
    const calls: { repoId: string; files: string[] }[] = [];
    const app = await appWith(
      new MockLLMProvider('openai', { structured: {} }),
      { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' },
      calls,
    );
    const { pr } = await newPr(['src/a.ts']);
    const body = BlastRadius.parse((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` })).json());
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('no_data');
    await app.close();
  });

  it('unknown PR is a 404 and a malformed id is a 422', async () => {
    const calls: { repoId: string; files: string[] }[] = [];
    const app = await appWith(
      new MockLLMProvider('openai', { structured: {} }),
      { changedSymbols: [], callers: [], impactedEndpoints: [] },
      calls,
    );
    expect((await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/blast` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pulls/abc/blast' })).statusCode).toBe(422);
    expect(calls).toHaveLength(0);
    await app.close();
  });
});
