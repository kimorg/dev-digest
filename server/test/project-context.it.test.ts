import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * SPEC-005 Project Context — API lane: repo documents, attachments, `include=skills`.
 * The review-run behaviour is in reviews.it.test.ts.
 */
d('project context API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: App;
  let workspaceId: string;
  let base: string;
  let seq = 0;
  const created: App[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    base = await mkdtemp(join(tmpdir(), 'dd-ctx-it-'));
    app = await mkApp('test');
  });
  afterAll(async () => {
    for (const a of created) await a.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  async function mkApp(nodeEnv: 'test' | 'development'): Promise<App> {
    const config = loadConfig({ ...process.env, NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);
    const a = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    created.push(a);
    return a;
  }

  /** A clone directory with the given files (path → content). */
  async function mkClone(files: Record<string, string>): Promise<string> {
    const dir = join(base, `clone-${seq++}`);
    await mkdir(dir, { recursive: true });
    for (const [p, c] of Object.entries(files)) {
      await mkdir(dirname(join(dir, p)), { recursive: true });
      await writeFile(join(dir, p), c);
    }
    return dir;
  }

  async function mkRepo(clonePath: string | null) {
    const name = `ctx-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  async function mkAgent() {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Ctx Agent ${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function mkSkill(extra: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `Ctx Skill ${seq++}`, description: 'd', type: 'custom', body: 'b', ...extra },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  const put = (kind: 'agents' | 'skills', id: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/${kind}/${id}/context`, payload: { paths } });

  const pathsOf = (body: { paths: { path: string }[] }) => body.paths.map((p) => p.path);

  // ---------------------------------------------------------------- repo documents

  it('GET lists a never-scanned clone: scans first, sorted, typed, no CLAUDE.md or nested README (AC-2…AC-5, AC-61)', async () => {
    const clone = await mkClone({
      'server/INSIGHTS.md': '# i',
      'server/AGENTS.md': '# a',
      'server/CLAUDE.md': '@AGENTS.md',
      'server/src/x/README.md': '# nested',
      'server/docs/auth.md': '# auth',
      'specs/005.md': '# spec',
      'docs/plans/006.md': '# plan',
      'notes.md': '# root notes',
    });
    const repo = await mkRepo(clone);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.scanned_at).toEqual(expect.any(String));
    expect(body.truncated).toBe(false);
    expect(body.documents.map((x: { path: string; type: string }) => [x.path, x.type])).toEqual([
      ['docs/plans/006.md', 'plans'],
      ['server/AGENTS.md', 'readme'],
      ['server/docs/auth.md', 'docs'],
      ['server/INSIGHTS.md', 'insights'],
      ['specs/005.md', 'specs'],
    ]);
    const auth = body.documents.find((x: { path: string }) => x.path === 'server/docs/auth.md');
    expect(auth).toMatchObject({ name: 'auth.md', dir: 'server/docs', too_large: false });
    expect(auth.tokens).toBeGreaterThan(0);
    expect(body.total_tokens).toBe(
      body.documents.reduce((s: number, x: { tokens: number }) => s + x.tokens, 0),
    );
  });

  it('two parallel rescans both answer 200 with one complete scan and a newer scanned_at (AC-8, EC-7)', async () => {
    const clone = await mkClone({ 'server/AGENTS.md': '# a', 'server/docs/a.md': '# a' });
    const repo = await mkRepo(clone);
    const first = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    await new Promise((r) => setTimeout(r, 10));

    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` }),
      app.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` }),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    for (const r of [r1, r2]) {
      expect(r.json().documents).toHaveLength(2);
      expect(new Date(r.json().scanned_at).getTime()).toBeGreaterThan(new Date(first.scanned_at).getTime());
    }
    const stored = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(stored.documents).toHaveLength(2);
  });

  it('a repo without a usable clone is no_clone; rescan is 409 repo_not_cloned (AC-12)', async () => {
    const noPath = await mkRepo(null);
    const missingDir = await mkRepo(join(base, 'does-not-exist'));
    for (const repo of [noPath, missingDir]) {
      const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'no_clone', documents: [], scanned_at: null });
      const rescan = await app.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` });
      expect(rescan.statusCode).toBe(409);
      expect(rescan.json().error.code).toBe('repo_not_cloned');
    }
  });

  it('GET file returns content; a file deleted after the scan is 404 context_doc_not_found (AC-15)', async () => {
    const clone = await mkClone({ 'server/docs/gone.md': '# Gone\nhello' });
    const repo = await mkRepo(clone);
    await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });

    const ok = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=server/docs/gone.md`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ path: 'server/docs/gone.md', type: 'docs', content: '# Gone\nhello' });

    await rm(join(clone, 'server/docs/gone.md'));
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=server/docs/gone.md`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('context_doc_not_found');
  });

  it('GET file rejects ../, .git and a symlinked .md with 422 invalid_context_path and leaks no bytes (AC-16, NFR-5)', async () => {
    const clone = await mkClone({ 'server/docs/real.md': '# r', '.git/config': 'ghp_GITSECRET' });
    await writeFile(join(base, `outside-${seq}.md`), 'OUTSIDE_SECRET');
    await symlink(join(base, `outside-${seq}.md`), join(clone, 'server/docs/link.md'));
    const repo = await mkRepo(clone);

    for (const p of ['../../etc/passwd', '.git/config', 'server/docs/link.md']) {
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repo.id}/context/file?path=${encodeURIComponent(p)}`,
      });
      expect(res.statusCode, p).toBe(422);
      expect(res.json().error.code, p).toBe('invalid_context_path');
      expect(res.body, p).not.toContain('OUTSIDE_SECRET');
      expect(res.body, p).not.toContain('GITSECRET');
    }
    // the symlink is not listed either (AC-59)
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(list.documents.map((x: { path: string }) => x.path)).toEqual(['server/docs/real.md']);
  });

  it('a file over 400 KB is listed too_large with 0 tokens; its file endpoint is 422 context_doc_too_large (AC-14)', async () => {
    const clone = await mkClone({ 'server/docs/big.md': 'x'.repeat(401 * 1024), 'server/docs/empty.md': '' });
    const repo = await mkRepo(clone);
    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    const big = list.documents.find((x: { path: string }) => x.path === 'server/docs/big.md');
    expect(big).toMatchObject({ too_large: true, tokens: 0 });
    // EC-14: an empty file is listed with 0 tokens
    const empty = list.documents.find((x: { path: string }) => x.path === 'server/docs/empty.md');
    expect(empty).toMatchObject({ too_large: false, tokens: 0, size_bytes: 0 });

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/context/file?path=server/docs/big.md`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('context_doc_too_large');
  });

  it('1001 documents → the first 1000 by path with truncated: true (EC-8)', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 1001; i++) files[`specs/s${String(i).padStart(4, '0')}.md`] = '# s';
    const repo = await mkRepo(await mkClone(files));
    const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(body.truncated).toBe(true);
    expect(body.documents).toHaveLength(1000);
    expect(body.documents[999].path).toBe('specs/s0999.md');
  });

  it('used_by counts the agents and skills whose attachments contain the path (AC-11)', async () => {
    const repo = await mkRepo(await mkClone({ 'server/docs/used-by.md': '# u' }));
    const agent = await mkAgent();
    const skill = await mkSkill();
    expect((await put('agents', agent.id, ['server/docs/used-by.md'])).statusCode).toBe(200);
    expect((await put('skills', skill.id, ['server/docs/used-by.md'])).statusCode).toBe(200);
    const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(body.documents[0].used_by).toEqual({ agents: 1, skills: 1 });
  });

  it('the 11th rescan within a minute is 429 rate_limited (R-API)', async () => {
    const dev = await mkApp('development');
    const repo = await mkRepo(await mkClone({ 'server/AGENTS.md': '# a' }));
    const codes: number[] = [];
    let last: { error: { code: string } } | undefined;
    for (let i = 0; i < 11; i++) {
      const res = await dev.inject({ method: 'POST', url: `/repos/${repo.id}/context/rescan` });
      codes.push(res.statusCode);
      last = res.json();
    }
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes[10]).toBe(429);
    expect(last!.error.code).toBe('rate_limited');
  });

  // ---------------------------------------------------------------- attachments

  it('PUT stores the list in the sent order and GET returns the same, for agents and skills (AC-32, AC-21)', async () => {
    const agent = await mkAgent();
    const skill = await mkSkill();
    const sent = ['server/docs/b.md', 'server/AGENTS.md', 'specs/a.md'];
    for (const [kind, id] of [
      ['agents', agent.id],
      ['skills', skill.id],
    ] as const) {
      const res = await put(kind, id, sent);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(pathsOf(body)).toEqual(sent);
      const orders = body.paths.map((p: { order: number }) => p.order);
      expect([...orders].sort((a, b) => a - b)).toEqual(orders);
      expect(new Set(orders).size).toBe(3);
      const got = await app.inject({ method: 'GET', url: `/${kind}/${id}/context` });
      expect(got.json()).toEqual(body);
    }
    // the last PUT wins and replaces the list (EC-6)
    const again = await put('agents', agent.id, ['specs/a.md']);
    expect(pathsOf(again.json())).toEqual(['specs/a.md']);
  });

  it('PUT with <pkg>/CLAUDE.md is 422 invalid_context_path and the stored list is unchanged (AC-33, EC-16)', async () => {
    const agent = await mkAgent();
    await put('agents', agent.id, ['server/AGENTS.md']);
    const bad = await put('agents', agent.id, ['server/docs/x.md', 'server/CLAUDE.md']);
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('invalid_context_path');
    const got = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json();
    expect(pathsOf(got)).toEqual(['server/AGENTS.md']);
  });

  it('PUT rejects duplicates (duplicate_context_path) and more than 100 paths (too_many_context_docs) (AC-34, AC-36)', async () => {
    const agent = await mkAgent();
    const dup = await put('agents', agent.id, ['server/AGENTS.md', 'server/AGENTS.md']);
    expect(dup.statusCode).toBe(422);
    expect(dup.json().error.code).toBe('duplicate_context_path');

    const many = Array.from({ length: 101 }, (_, i) => `server/docs/d${i}.md`);
    const over = await put('agents', agent.id, many);
    expect(over.statusCode).toBe(422);
    expect(over.json().error.code).toBe('too_many_context_docs');

    // 100 is still accepted
    const ok = await put('agents', agent.id, many.slice(0, 100));
    expect(ok.statusCode).toBe(200);
  });

  it('an unknown id or another workspace’s agent / skill is 404 not_found on GET, include=skills and PUT (AC-35)', async () => {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
    const [foreignAgent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: ws!.id, name: 'Foreign', provider: 'openai', model: 'm', systemPrompt: 's' })
      .returning();
    const [foreignSkill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: ws!.id,
        name: `Foreign ${seq++}`,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
      })
      .returning();

    const calls: Array<['GET' | 'PUT', string]> = [];
    for (const id of [randomUUID(), foreignAgent!.id]) {
      calls.push(['GET', `/agents/${id}/context`], ['GET', `/agents/${id}/context?include=skills`], ['PUT', `/agents/${id}/context`]);
    }
    for (const id of [randomUUID(), foreignSkill!.id]) {
      calls.push(['GET', `/skills/${id}/context`], ['PUT', `/skills/${id}/context`]);
    }
    for (const [method, url] of calls) {
      const res = await app.inject({
        method,
        url,
        ...(method === 'PUT' ? { payload: { paths: ['server/AGENTS.md'] } } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json().error.code, `${method} ${url}`).toBe('not_found');
    }
  });

  it('deleting an agent or a skill deletes its attachments (AC-37)', async () => {
    const agent = await mkAgent();
    const skill = await mkSkill();
    await put('agents', agent.id, ['server/AGENTS.md']);
    await put('skills', skill.id, ['server/AGENTS.md']);
    const agentRows = () =>
      pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agent.id));
    const skillRows = () =>
      pg.handle.db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skill.id));
    expect(await agentRows()).toHaveLength(1);
    expect(await skillRows()).toHaveLength(1);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBeLessThan(300);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBeLessThan(300);
    expect(await agentRows()).toHaveLength(0);
    expect(await skillRows()).toHaveLength(0);
  });

  // ---------------------------------------------------------------- include=skills

  async function linkSkills(agentId: string, ids: string[]) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: ids },
    });
    expect(res.statusCode).toBeLessThan(300);
  }

  it('include=skills lists enabled linked skills in link order, empty ones kept; disabled and unlinked absent (AC-62, EC-3, AC-49 wiring)', async () => {
    const agent = await mkAgent();
    const [s1, s2, s3, s4] = [await mkSkill(), await mkSkill(), await mkSkill(), await mkSkill()];
    await put('skills', s1.id, ['server/docs/one.md', 'server/docs/two.md']);
    await put('skills', s3.id, ['server/docs/disabled.md']);
    await put('skills', s4.id, ['server/docs/unlinked.md']);
    await app.inject({ method: 'PUT', url: `/skills/${s3.id}`, payload: { enabled: false } });
    await linkSkills(agent.id, [s2.id, s1.id, s3.id]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?include=skills` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.skills.map((s: { skill_id: string }) => s.skill_id)).toEqual([s2.id, s1.id]);
    expect(body.skills[0].paths).toEqual([]);
    // route response schema keeps skill_id and path/order (T-49)
    expect(body.skills[1]).toEqual({
      skill_id: s1.id,
      paths: [
        { path: 'server/docs/one.md', order: expect.any(Number) },
        { path: 'server/docs/two.md', order: expect.any(Number) },
      ],
    });
    expect(body.skills[1].paths[0].order).toBeLessThan(body.skills[1].paths[1].order);
  });

  it('include=skills returns each owner’s full stored list; shared paths are not removed (AC-63, EC-4, EC-19)', async () => {
    const agent = await mkAgent();
    const [s1, s2] = [await mkSkill(), await mkSkill()];
    await put('agents', agent.id, ['server/AGENTS.md', 'server/docs/own.md']);
    await put('skills', s1.id, ['server/docs/auth.md', 'server/AGENTS.md']);
    await put('skills', s2.id, ['server/docs/db.md', 'server/docs/auth.md']);
    await linkSkills(agent.id, [s1.id, s2.id]);

    const body = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?include=skills` })
    ).json();
    expect(pathsOf(body)).toEqual(['server/AGENTS.md', 'server/docs/own.md']);
    expect(body.skills.map((s: { paths: { path: string }[] }) => pathsOf(s))).toEqual([
      ['server/docs/auth.md', 'server/AGENTS.md'],
      ['server/docs/db.md', 'server/docs/auth.md'],
    ]);
    // equals what GET /skills/:id/context returns
    const direct = (await app.inject({ method: 'GET', url: `/skills/${s1.id}/context` })).json();
    expect(body.skills[0].paths).toEqual(direct.paths);
  });

  it('without include the body is { paths } only, no skills field (AC-64)', async () => {
    const agent = await mkAgent();
    const s1 = await mkSkill();
    await linkSkills(agent.id, [s1.id]);
    await put('agents', agent.id, ['server/AGENTS.md']);
    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body)).toEqual(['paths']);
    expect('skills' in body).toBe(false);
    expect(pathsOf(body)).toEqual(['server/AGENTS.md']);
  });

  it('include=foo is 422 validation_error (AC-65)', async () => {
    const agent = await mkAgent();
    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/context?include=foo` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });
});
