import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const FIXTURE_ZIP = new URL('../../docs/skills/flaky-test-patterns.zip', import.meta.url);

let seq = 0;
/** A valid create body with a name unique within this file's shared DB. */
function skillBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `Skill ${seq++}`,
    description: 'Flag every untested branch.',
    type: 'custom',
    body: '# Rule\nFlag it.',
    ...overrides,
  };
}

/**
 * Skills module (L02, server/specs/003-skills.md): CRUD, body versioning,
 * restore, import preview, agent links (+ counts, workspace isolation).
 * Prompt injection is covered in reviews.it.test.ts.
 */
d('skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function createSkill(overrides: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: skillBody(overrides) });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function createAgent() {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Agent ${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
    });
    return res.json() as { id: string };
  }

  it('lists the seeded Test Quality skills with their agent count', async () => {
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const uncovered = list.find((s: { name: string }) => s.name === 'Uncovered Branches');
    expect(uncovered).toMatchObject({
      type: 'custom',
      source: 'manual',
      enabled: true,
      version: 1,
      agent_count: 1,
    });
    expect(typeof uncovered.created_at).toBe('string');
    expect(typeof uncovered.updated_at).toBe('string');
  });

  it('creates v1 with a snapshot; GET returns it', async () => {
    const created = await createSkill({ type: 'rubric' });
    expect(created).toMatchObject({ version: 1, enabled: true, source: 'manual', agent_count: 0 });

    const got = (await app.inject({ method: 'GET', url: `/skills/${created.id}` })).json();
    expect(got.name).toBe(created.name);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ skill_id: created.id, version: 1, body: '# Rule\nFlag it.' });
  });

  it('rejects a duplicate name in any case (409) and invalid bodies (422)', async () => {
    const created = await createSkill();
    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: skillBody({ name: created.name.toUpperCase() }),
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('skill_name_taken');

    const empty = await app.inject({ method: 'POST', url: '/skills', payload: skillBody({ body: '' }) });
    expect(empty.statusCode).toBe(422);
    const badType = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: skillBody({ type: 'nope' }),
    });
    expect(badType.statusCode).toBe(422);

    // renaming onto another skill's name is a conflict too
    const other = await createSkill();
    const rename = await app.inject({
      method: 'PUT',
      url: `/skills/${other.id}`,
      payload: { name: created.name },
    });
    expect(rename.statusCode).toBe(409);
    const empty422 = await app.inject({ method: 'PUT', url: `/skills/${other.id}`, payload: {} });
    expect(empty422.statusCode).toBe(422);
  });

  it('only a body change creates a version; versions list newest first', async () => {
    const s = await createSkill();
    const meta = (
      await app.inject({
        method: 'PUT',
        url: `/skills/${s.id}`,
        payload: { description: 'New description.', enabled: false, type: 'security' },
      })
    ).json();
    expect(meta).toMatchObject({ version: 1, enabled: false, type: 'security' });

    const v2 = (
      await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'v2 body' } })
    ).json();
    expect(v2.version).toBe(2);
    const same = (
      await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'v2 body' } })
    ).json();
    expect(same.version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const v1 = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions/1` })).json();
    expect(v1.body).toBe('# Rule\nFlag it.');
    const missing = await app.inject({ method: 'GET', url: `/skills/${s.id}/versions/9` });
    expect(missing.statusCode).toBe(404);
  });

  it('restore writes the old body as a new version', async () => {
    const s = await createSkill();
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'second' } });
    await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { body: 'third' } });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${s.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 4, body: '# Rule\nFlag it.' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions).toHaveLength(4);
    const unknown = await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/42/restore` });
    expect(unknown.statusCode).toBe(404);
  });

  it('an imported_file skill is saved disabled', async () => {
    const s = await createSkill({ source: 'imported_file' });
    expect(s).toMatchObject({ source: 'imported_file', enabled: false });
  });

  it('links skills to an agent in order; counts follow; delete cascades the link', async () => {
    const agent = await createAgent();
    const a = await createSkill();
    const b = await createSkill();

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [b.id, a.id] },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().map((l: { skill_id: string }) => l.skill_id)).toEqual([b.id, a.id]);

    const agentDto = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(agentDto.skill_count).toBe(2);
    const listed = (await app.inject({ method: 'GET', url: '/agents' }))
      .json()
      .find((x: { id: string }) => x.id === agent.id);
    expect(listed.skill_count).toBe(2);
    expect((await app.inject({ method: 'GET', url: `/skills/${a.id}` })).json().agent_count).toBe(1);

    const del = await app.inject({ method: 'DELETE', url: `/skills/${b.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${b.id}` })).statusCode).toBe(404);
    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links.map((l: { skill_id: string }) => l.skill_id)).toEqual([a.id]);
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, b.id));
    expect(versions).toHaveLength(0);
  });

  it('rejects duplicate skill_ids (422) and unknown skills (404) without touching links', async () => {
    const agent = await createAgent();
    const a = await createSkill();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [a.id] } });

    const dup = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [a.id, a.id] },
    });
    expect(dup.statusCode).toBe(422);
    const unknown = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: ['00000000-0000-4000-8000-000000000000'] },
    });
    expect(unknown.statusCode).toBe(404);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links.map((l: { skill_id: string }) => l.skill_id)).toEqual([a.id]);
  });

  it("another workspace's skill is invisible and cannot be linked", async () => {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: ws!.id,
        name: 'Foreign',
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
      })
      .returning();
    const id = foreign!.id;

    for (const [method, url] of [
      ['GET', `/skills/${id}`],
      ['PUT', `/skills/${id}`],
      ['DELETE', `/skills/${id}`],
      ['GET', `/skills/${id}/versions`],
      ['POST', `/skills/${id}/versions/1/restore`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        ...(method === 'PUT' ? { payload: { enabled: false } } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === id)).toBe(false);

    const agent = await createAgent();
    for (const payload of [{ skill_ids: [id] }, { skill_id: id }]) {
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload });
      expect(res.statusCode).toBe(404);
    }
  });

  it('import preview parses the fixture archive and persists nothing', async () => {
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: {
        filename: 'flaky-test-patterns.zip',
        content_base64: readFileSync(FIXTURE_ZIP).toString('base64'),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'Flaky Test Patterns',
      type: 'custom',
      ignored_files: ['flaky-test-patterns/scripts/check.sh'],
    });
    const after = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    expect(after).toBe(before);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'tool.exe', content_base64: Buffer.from('x').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('skill_import_unsupported');
  });
});
