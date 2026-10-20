import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { ConventionCandidate, RepoConventions } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const FILES: Record<string, string> = {
  'tsconfig.json': '{\n  "compilerOptions": {\n    "strict": true\n  }\n}',
  '.prettierrc': '{ "singleQuote": true }',
  'src/api/users.ts': [
    "import { db } from '../db';",
    '',
    'export async function getUser(id: string) {',
    '  const user = await db.users.find(id);',
    '  const posts = await db.posts.findMany({ userId: id });',
    '  return { user, posts };',
    '}',
  ].join('\n'),
  'src/lib/redis.ts': 'export const redis = new Redis(config.redisUrl);',
};
/** Ranked samples repo-intel hands out (more than 12 to prove the cap is applied by the call). */
const RANKED = ['src/api/users.ts', 'src/lib/redis.ts'];

const asyncRule = {
  category: 'async',
  rule: 'Always use async/await instead of .then() chains',
  evidence: { file: 'src/api/users.ts', line_start: 4, line_end: 5, code: 'const user = await db.users.find(id);' },
  confidence: 0.91,
};
const redisRule = {
  category: 'structure',
  rule: 'Redis access goes through the src/lib/redis.ts singleton',
  evidence: { file: './src/lib/redis.ts', line_start: 1, line_end: 1, code: 'export const redis = new Redis(config.redisUrl);' },
  confidence: 85,
};
const strictRule = {
  category: 'typing',
  rule: 'TypeScript strict mode is on',
  evidence: { file: 'tsconfig.json', line_start: 3, line_end: 3, code: '"strict": true' },
  confidence: 0.7,
};
/** Evidence that doesn't exist: wrong code, missing file, path traversal. */
const fabricated = [
  { ...asyncRule, rule: 'Use callbacks', evidence: { ...asyncRule.evidence, code: 'cb(null, user)' } },
  { ...asyncRule, rule: 'Ghost file', evidence: { ...asyncRule.evidence, file: 'src/ghost.ts' } },
  { ...asyncRule, rule: 'Escape', evidence: { ...asyncRule.evidence, file: '../../etc/passwd' } },
];

/**
 * Conventions extractor (L02, server/specs/004-conventions.md): code-only sampling,
 * one model call, the evidence gate, persistence, accept/reject/edit, re-scan,
 * skill draft → POST /skills.
 */
d('conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let repoId: string;
  let otherRepoId: string;
  const fixtures: Record<string, unknown> = {
    ConventionExtraction: { candidates: [asyncRule, redisRule, strictRule, ...fabricated] },
  };
  const llm = new MockLLMProvider('openai', { structuredBySchema: fixtures });
  const sampleCalls: { repoId: string; n: number }[] = [];
  const repoIntel = {
    async getConventionSamples(id: string, n: number) {
      sampleCalls.push({ repoId: id, n });
      return RANKED.slice(0, n);
    },
  } as unknown as RepoIntel;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel,
      },
    });
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other' }).returning();
    const [other] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'other', name: 'api', fullName: 'other/api' })
      .returning();
    otherRepoId = other!.id;
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const extract = () => app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
  const list = async () =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as RepoConventions;
  const byRule = (r: RepoConventions, rule: string) => r.candidates.find((c) => c.rule === rule);

  it('GET before any scan → no scan, no candidates', async () => {
    expect(await list()).toEqual({ scan: null, candidates: [] });
  });

  it('extract samples configs + top-12 without a model, verifies evidence and persists', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'openai', model: 'conv-model-1' } } },
    });
    expect(put.statusCode).toBe(200);

    const res = await extract();
    expect(res.statusCode).toBe(200);
    const body = res.json() as RepoConventions;

    // sample selection: repo-intel asked for exactly 12; existing configs + ranked files only
    expect(sampleCalls.at(-1)).toEqual({ repoId, n: 12 });
    expect(body.scan).toMatchObject({
      status: 'done',
      model: 'conv-model-1',
      head_sha: 'a1b2c3d4', // MockGitClient's HEAD — evidence links pin to it
      sample_files: ['tsconfig.json', '.prettierrc', 'src/api/users.ts', 'src/lib/redis.ts'],
      sample_count: 4,
      candidate_count: 3,
      dropped_count: 3,
    });
    const structured = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structured).toHaveLength(1);
    expect(structured[0]!.req).toMatchObject({ model: 'conv-model-1', schemaName: 'ConventionExtraction' });

    // the gate: only real evidence survives, the snippet is the file's text
    expect(body.candidates.map((c) => c.rule)).toEqual([
      asyncRule.rule,
      redisRule.rule,
      strictRule.rule,
    ]);
    const a = byRule(body, asyncRule.rule)!;
    expect(a).not.toHaveProperty('category');
    expect(a).toMatchObject({
      evidence_path: 'src/api/users.ts',
      evidence_line_start: 4,
      evidence_line_end: 5,
      evidence_snippet: '  const user = await db.users.find(id);\n  const posts = await db.posts.findMany({ userId: id });',
      confidence: 0.91,
      status: 'pending',
    });
    expect(byRule(body, redisRule.rule)).toMatchObject({ evidence_path: 'src/lib/redis.ts', confidence: 0.85 });

    // persisted: a fresh GET returns the same
    expect(await list()).toEqual(body);
  });

  it('accept / edit / reject persist; a rejected candidate is gone and stays gone after a re-scan', async () => {
    const before = await list();
    const a = byRule(before, asyncRule.rule)!;
    const r = byRule(before, redisRule.rule)!;
    const s = byRule(before, strictRule.rule)!;

    const accepted = await app.inject({ method: 'PUT', url: `/conventions/${a.id}`, payload: { status: 'accepted' } });
    expect(accepted.json()).toMatchObject({ status: 'accepted' });
    const edited = await app.inject({
      method: 'PUT',
      url: `/conventions/${s.id}`,
      payload: { rule: 'Keep TypeScript strict mode on' },
    });
    expect(edited.json()).toMatchObject({ rule: 'Keep TypeScript strict mode on', status: 'pending' });
    const withCategory = await app.inject({
      method: 'PUT',
      url: `/conventions/${s.id}`,
      payload: { category: 'formatting' },
    });
    expect(withCategory.statusCode).toBe(422);
    const rejected = await app.inject({ method: 'PUT', url: `/conventions/${r.id}`, payload: { status: 'rejected' } });
    expect(rejected.statusCode).toBe(200);

    const after = await list();
    expect(after.candidates.map((c) => c.id).sort()).toEqual([a.id, s.id].sort());

    // re-scan: pending replaced, accepted kept, reviewed rules (accepted/rejected) not proposed again
    fixtures.ConventionExtraction = { candidates: [asyncRule, redisRule, strictRule] };
    const rescan = (await extract()).json() as RepoConventions;
    expect(rescan.scan).toMatchObject({ status: 'done', candidate_count: 1, dropped_count: 0 });
    const rules = rescan.candidates.map((c: ConventionCandidate) => [c.rule, c.status]);
    expect(rules).toEqual([
      [asyncRule.rule, 'accepted'],
      [strictRule.rule, 'pending'],
    ]);
    expect(rescan.candidates.find((c) => c.id === s.id)).toBeUndefined(); // the edited pending one was replaced
    const rows = await pg.handle.db
      .select({ id: t.conventions.id })
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), eq(t.conventions.status, 'rejected')));
    expect(rows).toHaveLength(1);
  });

  it('set-status accepts and deselects in bulk, never touching rejected ones', async () => {
    const { candidates } = await list();
    const ids = candidates.map((c) => c.id);
    const all = (await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/set-status`,
      payload: { ids, status: 'accepted' },
    })).json() as RepoConventions;
    expect(all.candidates.every((c) => c.status === 'accepted')).toBe(true);
    const none = (await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/set-status`,
      payload: { ids, status: 'pending' },
    })).json() as RepoConventions;
    expect(none.candidates.every((c) => c.status === 'pending')).toBe(true);
  });

  it('skill draft = accepted only, named repo-conventions; it saves through POST /skills', async () => {
    const empty = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` });
    expect(empty.statusCode).toBe(422);
    expect(empty.json().error.code).toBe('no_accepted_conventions');

    const { candidates } = await list();
    const a = candidates.find((c) => c.rule === asyncRule.rule)!;
    await app.inject({ method: 'PUT', url: `/conventions/${a.id}`, payload: { status: 'accepted' } });

    const draft = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/skill-draft` })).json();
    expect(draft).toMatchObject({
      name: 'repo-conventions',
      type: 'convention',
      convention_count: 1,
      evidence_files: ['src/api/users.ts'],
    });
    expect(draft.body).toContain(asyncRule.rule);
    expect(draft.body).not.toContain(strictRule.rule);
    expect(draft.body).not.toContain(redisRule.rule);

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: `${draft.body}\n\nEdited.`,
        source: 'extracted',
        enabled: false,
        evidence_files: draft.evidence_files,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'repo-conventions',
      source: 'extracted',
      enabled: false,
      version: 1,
      evidence_files: ['src/api/users.ts'],
    });
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as { name: string }[];
    expect(skills.map((s) => s.name)).toContain('repo-conventions');
  });

  it('a failed model call records a failed scan and keeps the candidates', async () => {
    const before = await list();
    fixtures.ConventionExtraction = { candidates: 'not-a-list' };
    const res = await extract();
    expect(res.statusCode).toBe(502);
    const after = await list();
    expect(after.scan).toMatchObject({ status: 'failed', candidate_count: 0 });
    expect(after.scan!.error).toContain('fixture failed schema');
    expect(after.candidates).toEqual(before.candidates);
    fixtures.ConventionExtraction = { candidates: [asyncRule] };
  });

  it('a second scan while one is running → 409', async () => {
    const original = llm.completeStructured.bind(llm);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    llm.completeStructured = (async (req) => {
      await gate;
      return original(req);
    }) as typeof llm.completeStructured;
    try {
      const first = extract();
      await new Promise((r) => setTimeout(r, 50));
      const second = await extract();
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('conventions_scan_running');
      release();
      expect((await first).statusCode).toBe(200);
    } finally {
      llm.completeStructured = original;
    }
  });

  it('another workspace / unknown ids → 404; bad bodies → 422', async () => {
    for (const url of [
      `/repos/${otherRepoId}/conventions`,
      `/repos/${otherRepoId}/conventions/skill-draft`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'POST', url: `/repos/${otherRepoId}/conventions/extract` })).statusCode,
    ).toBe(404);
    const unknown = await app.inject({
      method: 'PUT',
      url: '/conventions/00000000-0000-0000-0000-000000000000',
      payload: { status: 'accepted' },
    });
    expect(unknown.statusCode).toBe(404);
    const { candidates } = await list();
    const bad = await app.inject({ method: 'PUT', url: `/conventions/${candidates[0]!.id}`, payload: {} });
    expect(bad.statusCode).toBe(422);
  });

  it('no samples at all → 422 conventions_no_samples', async () => {
    const [ws] = await pg.handle.db.select({ id: t.repos.workspaceId }).from(t.repos).where(eq(t.repos.id, repoId));
    const [empty] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'empty', fullName: 'acme/empty' })
      .returning();
    const original = repoIntel.getConventionSamples;
    repoIntel.getConventionSamples = async () => ['src/nothing.ts'];
    const files = (app.container.git as unknown as { opts: { files: Record<string, string> } }).opts;
    const saved = files.files;
    files.files = {};
    try {
      const res = await app.inject({ method: 'POST', url: `/repos/${empty!.id}/conventions/extract` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('conventions_no_samples');
    } finally {
      repoIntel.getConventionSamples = original;
      files.files = saved;
    }
  });
});
