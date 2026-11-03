/** Infrastructure: the only place that calls `fetch`. */
import { z } from 'zod';
import { REQUEST_TIMEOUT_MS } from '../constants.js';
import { ApiError, ApiUnreachableError, ToolError } from '../errors.js';
import type { DevDigestApi } from '../ports.js';
import {
  ApiAgent,
  ApiBlastRadius,
  ApiConventions,
  ApiErrorBody,
  ApiPull,
  ApiRepo,
  ApiReview,
  ApiRun,
  ApiStartReview,
} from '../types.js';

export interface HttpApiOptions {
  apiUrl: string;
  timeoutMs?: number;
}

export function createHttpApi(
  { apiUrl, timeoutMs = REQUEST_TIMEOUT_MS }: HttpApiOptions,
  fetchImpl: typeof fetch = fetch,
): DevDigestApi {
  async function request<S extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const label = `${method} ${path}`;
    let res: Response;
    try {
      res = await fetchImpl(`${apiUrl}${path}`, {
        method,
        headers: body === undefined ? { accept: 'application/json' } : {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ApiUnreachableError(apiUrl);
    }

    const raw: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      const envelope = ApiErrorBody.safeParse(raw);
      throw envelope.success
        ? new ApiError(res.status, envelope.data.error.code, envelope.data.error.message, label)
        : new ApiError(res.status, 'http_error', res.statusText || 'request failed', label);
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ToolError(
        `DevDigest API and devdigest-mcp are out of sync (${label}). Update both to the same revision.`,
      );
    }
    return parsed.data;
  }

  return {
    listRepos: () => request('GET', '/repos', z.array(ApiRepo)),
    getPullByNumber: (repoId, number) =>
      request('GET', `/repos/${encodeURIComponent(repoId)}/pulls/${number}`, ApiPull),
    refreshPull: async (prId) => {
      await request('GET', `/pulls/${encodeURIComponent(prId)}`, z.unknown());
    },
    listAgents: () => request('GET', '/agents', z.array(ApiAgent)),
    startReview: async (prId, agentId) => {
      const started = await request(
        'POST',
        `/pulls/${encodeURIComponent(prId)}/review`,
        ApiStartReview,
        { agentId },
      );
      const run = started.runs[0];
      if (!run) {
        throw new ToolError(
          'DevDigest API started no run (POST /pulls/:id/review returned none). Check the server terminal.',
        );
      }
      return { runId: run.run_id };
    },
    listRuns: (prId) => request('GET', `/pulls/${encodeURIComponent(prId)}/runs`, z.array(ApiRun)),
    listReviews: (prId) =>
      request('GET', `/pulls/${encodeURIComponent(prId)}/reviews`, z.array(ApiReview)),
    getConventions: (repoId) =>
      request('GET', `/repos/${encodeURIComponent(repoId)}/conventions`, ApiConventions),
    getBlastRadius: (prId) =>
      request('GET', `/pulls/${encodeURIComponent(prId)}/blast`, ApiBlastRadius),
  };
}
