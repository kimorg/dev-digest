/**
 * Application: start (or attach to) a review run and wait for it.
 * Time and sleeping are injected so the loop is testable with a fake clock.
 */
import { MAX_POLL_ERRORS } from './constants.js';
import { ApiUnreachableError, ToolError } from './errors.js';
import type { DevDigestApi } from './ports.js';
import type { ApiAgent, ApiReview } from './types.js';

export interface WaitDeps {
  api: DevDigestApi;
  /** Resolves after `ms`, or early when `signal` aborts. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  now: () => number;
  timeoutMs: number;
  pollMs: number;
  signal?: AbortSignal;
}

export type WaitOutcome =
  | { kind: 'done'; review: ApiReview }
  | { kind: 'running'; runId: string };

export async function runAndWait(
  deps: WaitDeps,
  prId: string,
  agent: ApiAgent,
): Promise<WaitOutcome> {
  const { api, sleep, now, timeoutMs, pollMs, signal } = deps;

  // Prime pr_files like the UI does, so a stale clone does not give an empty diff.
  await api.refreshPull(prId);

  // Attach to an in-flight run instead of paying for a second one (a retry after a timeout).
  const runs = await api.listRuns(prId);
  const active = runs.find((r) => r.agent_id === agent.id && r.status === 'running');
  const runId = active ? active.run_id : (await api.startReview(prId, agent.id)).runId;

  const startedAt = now();
  let networkErrors = 0;

  for (;;) {
    if (signal?.aborted) return { kind: 'running', runId };
    await sleep(pollMs, signal);
    if (signal?.aborted) return { kind: 'running', runId };

    let current;
    try {
      current = (await api.listRuns(prId)).find((r) => r.run_id === runId);
      networkErrors = 0;
    } catch (err) {
      if (!(err instanceof ApiUnreachableError)) throw err;
      networkErrors++;
      if (networkErrors >= MAX_POLL_ERRORS) {
        throw new ToolError(
          `API went away while waiting; run ${runId} may have been reaped — restart the API (./scripts/dev.sh), then call get_findings.`,
        );
      }
      continue;
    }

    if (!current) {
      throw new ToolError(
        `Run ${runId} disappeared (deleted in the UI?). Call run_agent_on_pr again.`,
      );
    }

    if (current.status === 'done') {
      const reviews = await api.listReviews(prId);
      const review = reviews.find((r) => r.run_id === runId && r.kind === 'review');
      if (!review) {
        throw new ToolError(
          `Run ${runId} is done but its review was not found. Call get_findings to check.`,
        );
      }
      return { kind: 'done', review };
    }

    if (current.status === 'failed' || current.status === 'cancelled') {
      throw new ToolError(
        current.error
          ? `Run ${runId} ${current.status}: ${current.error}. Fix it (e.g. LLM key in Settings) and call run_agent_on_pr again.`
          : `Run ${runId} ${current.status}: no error recorded — likely reaped by an API restart. Call run_agent_on_pr again.`,
      );
    }

    if (now() - startedAt >= timeoutMs) return { kind: 'running', runId };
  }
}
