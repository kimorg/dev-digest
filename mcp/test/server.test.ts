import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { fakeApi, makeState, REPO, type FakeApiState } from './fake-api.js';
import { connectInMemory } from './mcp-client.js';

type Client = Awaited<ReturnType<typeof connectInMemory>>;
let client: Client | undefined;

async function connect(state: FakeApiState = makeState()): Promise<Client> {
  const server = buildServer({
    api: fakeApi(state),
    config: { runTimeoutMs: 110_000, pollMs: 1_000 },
    sleep: async () => {},
  });
  client = await connectInMemory(server);
  return client;
}

afterEach(async () => {
  await client?.close();
  client = undefined;
});

const NAMES = ['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius'];

describe('devdigest-mcp server', () => {
  it('lists the 5 tools in order within the token budget', async () => {
    const c = await connect();
    const tools = await c.listTools();

    expect(tools.map((t) => t.name)).toEqual(NAMES);
    const bytes = await c.toolsListBytes();
    expect(bytes).toBeLessThanOrEqual(6000);
    expect(c.instructions?.length).toBeLessThanOrEqual(600);
    for (const t of tools) expect(t.description.length).toBeLessThanOrEqual(300);

    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.list_agents.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    expect(byName.run_agent_on_pr.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
    expect(byName.run_agent_on_pr._meta).toBeUndefined();
    expect(byName.get_findings.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(Object.keys(byName.run_agent_on_pr.inputSchema.properties)).toEqual(['repo', 'pr', 'agent']);
  });

  it('list_agents returns a concise list without system_prompt', async () => {
    const state = makeState();
    (state.agents[0] as Record<string, unknown>).system_prompt = 'SECRET PROMPT';
    const c = await connect(state);

    const res = await c.callTool('list_agents');

    expect(res.isError).toBe(false);
    expect(JSON.parse(res.text).agents[0]).toMatchObject({ id: 'agent-1', name: 'General' });
    expect(res.text).not.toContain('SECRET');
  });

  it('leads forward on errors: unknown agent, PR not imported, blast on a PR that is not imported, no scan', async () => {
    const c = await connect();

    const agent = await c.callTool('get_findings', { repo: REPO.full_name, pr: 482, agent: 'Nope' });
    expect(agent.isError).toBe(true);
    expect(agent.text).toContain('list_agents');

    const pr = await c.callTool('get_findings', { repo: REPO.full_name, pr: 999, agent: 'General' });
    expect(pr.isError).toBe(true);
    expect(pr.text).toContain('Pull requests list');

    const repo = await c.callTool('get_conventions', { repo: 'x/unknown' });
    expect(repo.text).toContain("Repo 'x/unknown' is not added");
    expect(repo.text).toContain(REPO.full_name);

    const blast = await c.callTool('get_blast_radius', { repo: REPO.full_name, pr: 999 });
    expect(blast.isError).toBe(true);
    expect(blast.text).toContain('Pull requests list');
    expect(blast.text).not.toContain('not implemented');

    const scan = await c.callTool('get_conventions', { repo: 'ACME/Payments-API' });
    expect(scan.isError).toBe(true);
    expect(scan.text).toContain('Extract');

    const noReview = await c.callTool('get_findings', { repo: REPO.full_name, pr: 482, agent: 'General' });
    expect(noReview.text).toContain('call run_agent_on_pr');
  });

  it('get_blast_radius primes the PR and returns the compact impact map', async () => {
    const state = makeState({
      blast: {
        changed_symbols: [{ name: 'getContext', file: 'src/ctx.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'getContext',
            callers: [{ name: 'routes', file: 'src/a/routes.ts', line: 12 }],
            endpoints_affected: ['GET /x'],
            crons_affected: [],
          },
        ],
        summary: '1 changed symbol, 1 caller, 1 endpoint, 0 crons',
        degraded: false,
        reason: null,
      },
    });
    const c = await connect(state);
    const res = await c.callTool('get_blast_radius', { repo: REPO.full_name, pr: 482 });

    expect(res.isError).toBe(false);
    const body = JSON.parse(res.text);
    expect(body.symbols[0]).toEqual({
      symbol: 'getContext',
      file: 'src/ctx.ts',
      callers: ['src/a/routes.ts:12 routes'],
      endpoints: ['GET /x'],
      crons: [],
    });
    expect(body.counts).toEqual({ symbols: 1, callers: 1, endpoints: 1, crons: 0 });
    expect(body.degraded).toBeUndefined();
    expect(state.calls.indexOf('refreshPull')).toBeLessThan(state.calls.indexOf('getBlastRadius'));

    const tools = await c.listTools();
    const t = tools.find((x) => x.name === 'get_blast_radius')!;
    expect(t.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
  });

  it('returns invalid arguments as an error result instead of calling the API', async () => {
    const state = makeState();
    const c = await connect(state);

    const res = await c.callTool('get_findings', { repo: 'not a repo', pr: 1.5, agent: '' });

    expect(res.isError).toBe(true);
    expect(state.calls).toEqual([]);
  });

  it('returns a compact finished review for get_findings', async () => {
    const state = makeState({
      runs: [{ run_id: 'run-1', agent_id: 'agent-1', status: 'done', error: null }],
      reviews: [
        {
          id: 'rev-1', agent_id: 'agent-1', run_id: 'run-1', kind: 'review',
          verdict: 'request_changes', summary: 'Needs work', score: 40,
          findings: [{
            severity: 'CRITICAL', category: 'security', title: 'SQL injection', file: 'src/db.ts',
            start_line: 10, end_line: 12, rationale: 'unsanitised', dismissed_at: null,
          }],
        },
      ],
    });
    const c = await connect(state);

    const res = await c.callTool('get_findings', { repo: REPO.full_name, pr: 482, agent: 'agent-1' });

    expect(res.isError).toBe(false);
    expect(JSON.parse(res.text)).toMatchObject({
      status: 'done', verdict: 'request_changes', score: 40,
      counts: { critical: 1, warning: 0, suggestion: 0 },
      findings: [{ title: 'SQL injection', lines: '10-12' }],
    });
  });
});
