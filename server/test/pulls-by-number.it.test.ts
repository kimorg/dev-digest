/**
 * GET /repos/:id/pulls/:number — DB-only PR lookup by number (no GitHub sync, no writes).
 * Gated on Docker, matching the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /repos/:id/pulls/:number (Testcontainers pg)', () => {
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

  it('returns the imported PR, and answers 404 / 422 with the error envelope', async () => {
    const db = pg.handle.db;
    const app = await buildApp({ config: config(), db });
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'by-number', fullName: 'acme/by-number' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 42,
        title: 'Add by-number lookup',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: 'cafebabe',
        additions: 3,
        deletions: 1,
        filesCount: 2,
        status: 'open',
      })
      .returning();

    const ok = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls/42` });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as PrMeta;
    expect(body).toMatchObject({
      id: pr!.id,
      number: 42,
      head_sha: 'cafebabe',
      status: 'needs_review',
      title: 'Add by-number lookup',
      files_count: 2,
    });
    expect(Object.keys(body)).not.toContain('score');

    const missing = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls/999` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    expect(missing.json().error.message).toContain('PR #999 is not imported for acme/by-number');

    // A repo that belongs to another workspace is invisible.
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [foreign] = await db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'zed', name: 'secret', fullName: 'zed/secret' })
      .returning();
    const other = await app.inject({ method: 'GET', url: `/repos/${foreign!.id}/pulls/42` });
    expect(other.statusCode).toBe(404);
    expect(other.json().error.message).toBe('Repo not found');

    const bad = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls/abc` });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');
  });
});
