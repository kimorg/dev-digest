import { describe, expect, it, vi } from 'vitest';
import { createHttpApi } from '../src/adapters/http-api.js';
import { ApiError, ApiUnreachableError, ToolError, describeError } from '../src/errors.js';

const API_URL = 'http://localhost:3001';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const apiWith = (impl: typeof fetch) => createHttpApi({ apiUrl: API_URL }, impl);

describe('createHttpApi', () => {
  it('turns a network failure into a forward-leading "start the API" message', async () => {
    const api = apiWith(vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch);

    const err = await api.listAgents().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiUnreachableError);
    expect(describeError(err)).toContain(API_URL);
    expect(describeError(err)).toContain('./scripts/dev.sh');
  });

  it('reads the error envelope of a 404 and maps 429 / 5xx to their hints', async () => {
    const notFound = apiWith((async () =>
      json({ error: { code: 'not_found', message: 'PR #9 is not imported' } }, 404)) as typeof fetch);
    const err = await notFound.getPullByNumber('r1', 9).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).message).toBe('PR #9 is not imported');

    const limited = apiWith((async () =>
      json({ error: { code: 'rate_limited', message: 'slow down' } }, 429)) as typeof fetch);
    expect(describeError(await limited.listAgents().catch((e: unknown) => e))).toContain('Wait a minute');

    const broken = apiWith((async () =>
      json({ error: { code: 'internal_error', message: 'boom' } }, 500)) as typeof fetch);
    expect(describeError(await broken.listAgents().catch((e: unknown) => e))).toBe(
      'DevDigest API error 500: boom. Check the server terminal.',
    );
  });

  it('reports an unexpected response shape as "out of sync" instead of passing it on', async () => {
    const api = apiWith((async () => json([{ id: 1 }])) as typeof fetch);

    const err = await api.listRepos().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).message).toContain('out of sync (GET /repos)');
  });

  it('reads the blast map from GET /pulls/:id/blast', async () => {
    const fetchMock = vi.fn(async () =>
      json({ changed_symbols: [], downstream: [], summary: 's', degraded: true, reason: 'no_data' }),
    );
    const api = apiWith(fetchMock as unknown as typeof fetch);

    const blast = await api.getBlastRadius('pr 1');

    expect(blast.reason).toBe('no_data');
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(`${API_URL}/pulls/pr%201/blast`);
  });

  it('starts a review with the agent id and returns the run id', async () => {
    const fetchMock = vi.fn(async () =>
      json({ pr_id: 'p1', runs: [{ run_id: 'run-1', agent_id: 'a1', agent_name: 'General' }], reviews: [] }),
    );
    const api = apiWith(fetchMock as unknown as typeof fetch);

    await expect(api.startReview('p1', 'a1')).resolves.toEqual({ runId: 'run-1' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_URL}/pulls/p1/review`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ agentId: 'a1' }));
  });
});
