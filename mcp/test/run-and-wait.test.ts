import { describe, expect, it } from 'vitest';
import { ApiUnreachableError, ToolError } from '../src/errors.js';
import type { ApiReview } from '../src/types.js';
import { runAndWait, type WaitDeps } from '../src/run-and-wait.js';
import { AGENT, fakeApi, makeState, type FakeApiState } from './fake-api.js';

const review = (over: Partial<ApiReview> = {}): ApiReview => ({
  id: 'rev-1',
  agent_id: AGENT.id,
  run_id: 'run-new',
  kind: 'review',
  verdict: 'approve',
  summary: 's',
  score: 95,
  findings: [],
  ...over,
});

function setup(state: FakeApiState, over: Partial<WaitDeps> = {}) {
  let clock = 0;
  const deps: WaitDeps = {
    api: fakeApi(state),
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
    timeoutMs: 110_000,
    pollMs: 3_000,
    ...over,
  };
  return deps;
}

describe('runAndWait', () => {
  it('primes, starts a run and returns the review once the run is done', async () => {
    const state = makeState({
      onListRuns: (s, call) => {
        if (call === 4 && s.runs[0]) {
          s.runs[0].status = 'done';
          s.reviews.unshift(review());
        }
      },
    });

    const outcome = await runAndWait(setup(state), 'pr-1', AGENT);

    expect(outcome).toMatchObject({ kind: 'done', review: { id: 'rev-1' } });
    expect(state.calls.slice(0, 3)).toEqual(['refreshPull', 'listRuns', 'startReview']);
    expect(state.calls.filter((c) => c === 'startReview')).toHaveLength(1);
  });

  it('attaches to an already running run without a second POST', async () => {
    const state = makeState({
      runs: [{ run_id: 'run-old', agent_id: AGENT.id, status: 'running', error: null }],
      onListRuns: (s, call) => {
        if (call === 2 && s.runs[0]) {
          s.runs[0].status = 'done';
          s.reviews.unshift(review({ run_id: 'run-old' }));
        }
      },
    });

    const outcome = await runAndWait(setup(state), 'pr-1', AGENT);

    expect(outcome).toMatchObject({ kind: 'done' });
    expect(state.calls).not.toContain('startReview');
  });

  it('explains a failed run with its error, and a reaped one (error = null) separately', async () => {
    const failing = (error: string | null) =>
      makeState({
        onListRuns: (s, call) => {
          if (call === 2 && s.runs[0]) {
            s.runs[0].status = 'failed';
            s.runs[0].error = error;
          }
        },
      });

    const withError = await runAndWait(setup(failing('no LLM key')), 'pr-1', AGENT).catch((e: unknown) => e);
    expect(withError).toBeInstanceOf(ToolError);
    expect((withError as ToolError).message).toContain('failed: no LLM key');

    const reaped = await runAndWait(setup(failing(null)), 'pr-1', AGENT).catch((e: unknown) => e);
    expect((reaped as ToolError).message).toContain('no error recorded — likely reaped by an API restart');
  });

  it('returns running when the deadline passes, and when the request is aborted', async () => {
    const state = makeState();
    const timedOut = await runAndWait(setup(state, { timeoutMs: 10_000, pollMs: 3_000 }), 'pr-1', AGENT);
    expect(timedOut).toEqual({ kind: 'running', runId: 'run-new' });

    const controller = new AbortController();
    controller.abort();
    const aborted = await runAndWait(setup(makeState(), { signal: controller.signal }), 'pr-1', AGENT);
    expect(aborted).toEqual({ kind: 'running', runId: 'run-new' });
  });

  it('gives up after 3 consecutive network failures but survives a single one', async () => {
    let fails = 0;
    const flaky = makeState({
      listRunsError: () => (++fails === 3 ? new ApiUnreachableError('http://x') : undefined),
      onListRuns: (s, call) => {
        if (call === 5 && s.runs[0]) {
          s.runs[0].status = 'done';
          s.reviews.unshift(review());
        }
      },
    });
    expect((await runAndWait(setup(flaky), 'pr-1', AGENT)).kind).toBe('done');

    const dead = makeState({
      listRunsError: () => (dead.calls.filter((c) => c === 'listRuns').length >= 2
        ? new ApiUnreachableError('http://x')
        : undefined),
    });
    const err = await runAndWait(setup(dead), 'pr-1', AGENT).catch((e: unknown) => e);
    expect((err as ToolError).message).toContain('API went away while waiting');
  });
});
