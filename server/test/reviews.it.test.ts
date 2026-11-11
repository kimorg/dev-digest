import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
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

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = await waitForRunTrace(app, runId);
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);
    // No `Intent` fixture → the intent step fails soft: the run still succeeds,
    // the trace records the failure and the prompt has no intent block.
    expect(trace.intent.status).toBe('failed');
    expect(trace.prompt_assembly.intent ?? null).toBeNull();

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');
    // Run Cost Badge: the engine's costUsd (mock: $0.001 per call, one call
    // single-pass) is persisted on the run, the timeline row and the trace.
    expect(run!.costUsd).toBeCloseTo(0.001);
    expect(trace.stats.cost_usd).toBeCloseTo(0.001);
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json();
    expect(runs[0].cost_usd).toBeCloseTo(0.001);

    await app.close();
  });

  it('intent: block in the prompt, scope filter drops out-of-scope findings, trace records it', async () => {
    const IntentFixture = {
      intent: 'Add rate limiting to public endpoints',
      in_scope: ['limiter'],
      out_of_scope: ['config cleanup'],
    };
    const finding = (id: string, over: Record<string, unknown>) => ({
      id,
      severity: 'WARNING',
      category: 'bug',
      title: id,
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.5,
      kind: 'finding',
      ...over,
    });
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        Intent: IntentFixture,
        Review: {
          verdict: 'comment',
          summary: 's',
          score: 50,
          findings: [finding('f-in', { severity: 'CRITICAL', category: 'security', in_scope: true }), finding('f-out', { in_scope: false })],
        },
      },
    });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // A real description → medium confidence (the linked issue can't be fetched without a token).
    await pg.handle.db
      .update(t.pullRequests)
      .set({ body: 'Add rate limiting to the public API so unauthenticated clients cannot hammer the endpoints. Closes #471.' })
      .where(eq(t.pullRequests.id, pr.id));
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec2', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = await waitForRunTrace(app, runId);
    expect(trace.intent.status).toBe('regenerated');
    expect(trace.intent.confidence).toBe('medium');
    expect(trace.intent.scope_filter).toBe('applied');
    expect(trace.intent.filtered_out).toBe(1);
    expect(trace.intent.diff_tokens).toBeGreaterThan(0);
    expect(trace.prompt_assembly.intent).toContain('Add rate limiting to public endpoints');
    expect(trace.prompt_assembly.tokens.intent).toBeGreaterThan(0);
    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews[0].findings.map((f: { title: string }) => f.title)).toEqual(['f-in']);
    // 1 Intent call + 1 Review call
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);

    // A second run on the unchanged PR reuses the stored intent (no extra Intent call).
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(3);

    await app.close();
  });

  it('injects linked, enabled skills in link order and records their tokens in the trace (L02)', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();
    const mkSkill = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name, description: `${name} rule.`, type: 'custom', body: `Body of ${name}.` },
        })
      ).json();
    const alpha = await mkSkill('Alpha Rule');
    const beta = await mkSkill('Beta Rule');

    // Run the agent and return the persisted trace of that (n-th) run.
    const runAndTrace = async (n: number) => {
      const runId = (
        await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
      ).json().runs[0].run_id;
      await waitForPrRuns(pg.handle.db, pr.id, { expected: n });
      return waitForRunTrace(app, runId);
    };
    const link = (ids: string[]) =>
      app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: ids } });

    await link([alpha.id, beta.id]);
    const first = (await runAndTrace(1)).prompt_assembly;
    expect(first.skills.indexOf('<skill name="Alpha Rule" version="1">')).toBeGreaterThanOrEqual(0);
    expect(first.skills.indexOf('Alpha Rule')).toBeLessThan(first.skills.indexOf('Beta Rule'));
    expect(first.user).toContain('## Skills / rules');
    expect(first.tokens.skills).toBeGreaterThan(0);
    expect(first.tokens.memory).toBeNull();
    expect(first.skill_refs.map((r: { name: string }) => r.name)).toEqual(['Alpha Rule', 'Beta Rule']);
    expect(first.skill_refs[0]).toMatchObject({ id: alpha.id, version: 1 });
    expect(first.skill_refs[0].tokens).toBeGreaterThan(0);

    // Reorder → the blocks swap places in the next run's prompt.
    await link([beta.id, alpha.id]);
    const second = (await runAndTrace(2)).prompt_assembly;
    expect(second.skills.indexOf('Beta Rule')).toBeLessThan(second.skills.indexOf('Alpha Rule'));

    // A globally disabled skill stays linked but is skipped at run time.
    await app.inject({ method: 'PUT', url: `/skills/${beta.id}`, payload: { enabled: false } });
    const third = (await runAndTrace(3)).prompt_assembly;
    expect(third.skills).not.toContain('Beta Rule');
    expect(third.skill_refs.map((r: { name: string }) => r.name)).toEqual(['Alpha Rule']);
    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links).toHaveLength(2);

    // No enabled skills → the section is absent and its token slot is null.
    await link([]);
    const fourth = (await runAndTrace(4)).prompt_assembly;
    expect(fourth.skills).toBeNull();
    expect(fourth.tokens.skills).toBeNull();
    expect(fourth.skill_refs).toEqual([]);
    expect(fourth.user).not.toContain('## Skills / rules');

    await app.close();
  });

  it('PR list COST = sum of all agent runs (NULL costs skipped; null when none) + FINDINGS of the latest review per agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [unreviewed] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo.id,
        number: 483,
        title: 'No runs yet',
        author: 'deepak.r',
        branch: 'feat/none',
        base: 'main',
        headSha: 'e5f6a7b8',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, prId: pr.id, status: 'done', costUsd: 0.002 },
      { workspaceId, prId: pr.id, status: 'done', costUsd: 0.0005 },
      { workspaceId, prId: pr.id, status: 'failed', costUsd: null },
    ]);
    // Agent A ran twice (rvA1 → rvA2), agent B once (rvB, between them) →
    // FINDINGS sums A's newer review and B's review, dismissed findings included.
    // Explicit createdAt: a multi-row insert would give all rows the same now().
    const agentA = randomUUID();
    const agentB = randomUUID();
    const [rvA1, rvB, rvA2] = await pg.handle.db
      .insert(t.reviews)
      .values([
        { workspaceId, prId: pr.id, agentId: agentA, kind: 'review', score: 40, createdAt: new Date('2026-10-01T10:00:00Z') },
        { workspaceId, prId: pr.id, agentId: agentB, kind: 'review', score: 55, createdAt: new Date('2026-10-01T12:00:00Z') },
        { workspaceId, prId: pr.id, agentId: agentA, kind: 'review', score: 70, createdAt: new Date('2026-10-02T10:00:00Z') },
      ])
      .returning();
    const finding = (reviewId: string, severity: string, dismissed = false) => ({
      reviewId,
      file: 'src/a.ts',
      startLine: 1,
      endLine: 1,
      severity,
      category: 'bug',
      title: `${severity} finding`,
      rationale: 'r',
      confidence: 0.9,
      dismissedAt: dismissed ? new Date() : null,
    });
    await pg.handle.db.insert(t.findings).values([
      finding(rvA1!.id, 'CRITICAL'),
      finding(rvA1!.id, 'WARNING'),
      finding(rvB!.id, 'WARNING'),
      finding(rvA2!.id, 'CRITICAL', true),
      finding(rvA2!.id, 'SUGGESTION'),
    ]);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const list = res.json() as Array<{
      id: string;
      cost_usd: number | null;
      findings_counts: { critical: number; warning: number; suggestion: number } | null;
    }>;
    expect(list.find((p) => p.id === pr.id)!.cost_usd).toBeCloseTo(0.0025);
    expect(list.find((p) => p.id === unreviewed!.id)!.cost_usd).toBeNull();
    expect(list.find((p) => p.id === pr.id)!.findings_counts).toEqual({
      critical: 1,
      warning: 1,
      suggestion: 1,
    });
    expect(list.find((p) => p.id === unreviewed!.id)!.findings_counts).toBeNull();

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });

  // ------------------------------------------------------------------
  // SPEC-005 project context in the review run (AC-38…AC-49, EC-3, EC-4, EC-19, EC-20)
  // ------------------------------------------------------------------
  describe('project context in a run', () => {
    const cloneDirs: string[] = [];
    afterAll(async () => {
      for (const dir of cloneDirs) await rm(dir, { recursive: true, force: true });
    });

    interface SkillSpec {
      paths: string[];
      enabled?: boolean;
      linked?: boolean;
    }
    interface Scenario {
      /** `null` = the repo has no clone. */
      files: Record<string, string> | null;
      agentPaths?: string[];
      /** In link order. */
      skills?: SkillSpec[];
    }

    let seq = 0;
    async function runScenario(sc: Scenario) {
      const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
      const app = await buildApp({
        config: config(),
        db: pg.handle.db,
        overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
      });
      const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
      if (sc.files) {
        const dir = await mkdtemp(join(tmpdir(), 'dd-ctx-run-'));
        cloneDirs.push(dir);
        for (const [p, c] of Object.entries(sc.files)) {
          await mkdir(dirname(join(dir, p)), { recursive: true });
          await writeFile(join(dir, p), c);
        }
        await pg.handle.db.update(t.repos).set({ clonePath: dir }).where(eq(t.repos.id, repo.id));
      }
      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: `CtxRun ${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'sys' },
        })
      ).json();
      const put = (kind: string, id: string, paths: string[]) =>
        app.inject({ method: 'PUT', url: `/${kind}/${id}/context`, payload: { paths } });
      if (sc.agentPaths) expect((await put('agents', agent.id, sc.agentPaths)).statusCode).toBe(200);

      const skillIds: string[] = [];
      const linkIds: string[] = [];
      for (const s of sc.skills ?? []) {
        const skill = (
          await app.inject({
            method: 'POST',
            url: '/skills',
            payload: { name: `CtxRunSkill ${seq++}`, description: 'd', type: 'custom', body: 'b' },
          })
        ).json();
        skillIds.push(skill.id);
        expect((await put('skills', skill.id, s.paths)).statusCode).toBe(200);
        if (s.enabled === false) {
          await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });
        }
        if (s.linked !== false) linkIds.push(skill.id);
      }
      if (linkIds.length > 0) {
        await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: linkIds } });
      }

      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
      expect(res.statusCode).toBe(200);
      const runId = res.json().runs[0].run_id;
      const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      expect(runs[0]!.status).toBe('done');
      const trace = await waitForRunTrace(app, runId);
      const docs = sc.files
        ? ((await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json().documents as {
            path: string;
            tokens: number;
          }[])
        : [];
      await app.close();
      const logs = (trace.log as { msg: string }[]).map((l) => l.msg);
      return { trace, logs, llm, skillIds, docs, agentId: agent.id as string };
    }

    const specLogs = (logs: string[]) => logs.filter((m) => m.startsWith('Specs:'));
    const reviewCalls = (llm: MockLLMProvider) =>
      llm.calls.filter((c) => (c.req as { schemaName?: string }).schemaName === 'Review').length;

    it('merges agent then skills, dedupes, wraps as untrusted and records specs_read / spec_refs / tokens (AC-38, 39, 43, 49, EC-4, EC-19, NFR-4)', async () => {
      const files = {
        'server/AGENTS.md': '# Agents\nUse pnpm everywhere.',
        'server/docs/auth.md': '# Auth\nTokens expire in one hour.',
        'server/docs/db.md': '# DB\nMigrations are generated.',
      };
      const { trace, logs, skillIds, docs } = await runScenario({
        files,
        agentPaths: ['server/AGENTS.md'],
        skills: [
          { paths: ['server/docs/auth.md', 'server/AGENTS.md'] }, // S1 repeats the agent's path
          { paths: ['server/docs/db.md', 'server/docs/auth.md'] }, // S2 repeats S1's path
        ],
      });

      expect(trace.specs_read).toEqual(['server/AGENTS.md', 'server/docs/auth.md', 'server/docs/db.md']);
      const refs = trace.prompt_assembly.spec_refs as {
        path: string;
        source: string;
        skill_id: string | null;
        tokens: number;
      }[];
      expect(refs.map((r) => [r.path, r.source, r.skill_id])).toEqual([
        ['server/AGENTS.md', 'agent', null],
        ['server/docs/auth.md', 'skill', skillIds[0]],
        ['server/docs/db.md', 'skill', skillIds[1]],
      ]);

      // prompt: untrusted wrappers in merged order, each doc once
      const specs: string = trace.prompt_assembly.specs;
      expect(trace.prompt_assembly.user).toContain('## Project context');
      const at = (p: string) => specs.indexOf(`<untrusted source="spec:${p}">`);
      expect(at('server/AGENTS.md')).toBeGreaterThanOrEqual(0);
      expect(at('server/AGENTS.md')).toBeLessThan(at('server/docs/auth.md'));
      expect(at('server/docs/auth.md')).toBeLessThan(at('server/docs/db.md'));
      expect(specs.split('Tokens expire in one hour.')).toHaveLength(2);

      // tokens: total, log line, and equality with the Context list (NFR-4)
      const total = refs.reduce((s, r) => s + r.tokens, 0);
      expect(trace.prompt_assembly.tokens.specs).toBeGreaterThan(0);
      expect(specLogs(logs)).toEqual([`Specs: 3 context doc(s) attached to prompt (~${total} tokens)`]);
      for (const r of refs) expect(r.tokens).toBe(docs.find((x) => x.path === r.path)!.tokens);
    });

    it('skips a missing, an oversize and an empty file with a log line each and still finishes (AC-44, AC-45, EC-1, EC-14)', async () => {
      const { trace, logs } = await runScenario({
        files: {
          'server/docs/ok.md': '# ok\nfine',
          'server/docs/big.md': 'x'.repeat(401 * 1024),
          'server/docs/empty.md': '',
        },
        agentPaths: [
          'server/docs/ok.md',
          'server/docs/renamed.md',
          'server/docs/big.md',
          'server/docs/empty.md',
        ],
      });
      expect(specLogs(logs)).toEqual(
        expect.arrayContaining([
          'Specs: skipped server/docs/renamed.md — not found in repo clone',
          'Specs: skipped server/docs/big.md — too large',
          'Specs: skipped server/docs/empty.md — empty',
        ]),
      );
      expect(trace.specs_read).toEqual(['server/docs/ok.md']);
    });

    it('no clone + an attachment logs the single "repo not cloned" line; no attachments logs no Specs line (AC-46)', async () => {
      const withAttachment = await runScenario({ files: null, agentPaths: ['server/AGENTS.md', 'specs/a.md'] });
      expect(specLogs(withAttachment.logs)).toEqual(['Specs: repo not cloned — context skipped']);
      expect(withAttachment.trace.specs_read).toEqual([]);

      const none = await runScenario({ files: null });
      expect(specLogs(none.logs)).toEqual([]);
    });

    it('no attachments → no Project context section, specs null, specs_read [], spec_refs null (AC-47)', async () => {
      const { trace } = await runScenario({ files: { 'server/AGENTS.md': '# a' } });
      expect(trace.prompt_assembly.specs ?? null).toBeNull();
      expect(trace.prompt_assembly.user).not.toContain('## Project context');
      expect(trace.prompt_assembly.tokens.specs ?? null).toBeNull();
      expect(trace.specs_read).toEqual([]);
      expect(trace.prompt_assembly.spec_refs ?? null).toBeNull();
    });

    it('docs of a disabled skill and of an unlinked skill are not read (EC-3)', async () => {
      const { trace } = await runScenario({
        files: {
          'server/docs/live.md': '# live',
          'server/docs/disabled.md': '# disabled',
          'server/docs/unlinked.md': '# unlinked',
        },
        skills: [
          { paths: ['server/docs/live.md'] },
          { paths: ['server/docs/disabled.md'], enabled: false },
          { paths: ['server/docs/unlinked.md'], linked: false },
        ],
      });
      expect(trace.specs_read).toEqual(['server/docs/live.md']);
    });

    it('project context adds no LLM calls (AC-42)', async () => {
      const without = await runScenario({ files: { 'server/AGENTS.md': '# a' } });
      const withCtx = await runScenario({
        files: { 'server/AGENTS.md': '# a', 'server/docs/x.md': '# x' },
        agentPaths: ['server/AGENTS.md', 'server/docs/x.md'],
      });
      expect(withCtx.trace.specs_read).toHaveLength(2);
      expect(reviewCalls(withCtx.llm)).toBe(reviewCalls(without.llm));
      expect(withCtx.llm.calls.length).toBe(without.llm.calls.length);
    });

    it('EC-20: a skill’s deleted doc is skipped with a log line and only the present doc is read (AC-44)', async () => {
      const { trace, logs } = await runScenario({
        files: { 'server/docs/security.md': '# Security\nNo secrets in code.' },
        skills: [{ paths: ['server/docs/security.md', 'server/docs/old-auth.md'] }],
      });
      expect(specLogs(logs)).toContain('Specs: skipped server/docs/old-auth.md — not found in repo clone');
      expect(trace.specs_read).toEqual(['server/docs/security.md']);
    });
  });
});
