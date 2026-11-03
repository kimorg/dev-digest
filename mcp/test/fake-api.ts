import type { DevDigestApi } from '../src/ports.js';
import type {
  ApiAgent,
  ApiBlastRadius,
  ApiConventions,
  ApiPull,
  ApiRepo,
  ApiReview,
  ApiRun,
} from '../src/types.js';
import { ApiError } from '../src/errors.js';

export interface FakeApiState {
  repos: ApiRepo[];
  pulls: Record<string, ApiPull>; // key: `${repoId}#${number}`
  agents: ApiAgent[];
  runs: ApiRun[]; // newest first
  reviews: ApiReview[]; // newest first
  conventions: ApiConventions;
  blast: ApiBlastRadius;
  /** Called on every `listRuns` — lets a test advance the run state. */
  onListRuns?: (state: FakeApiState, call: number) => void;
  /** When set, `listRuns` throws it (after `onListRuns`). */
  listRunsError?: () => Error | undefined;
  startedRunId: string;
  calls: string[];
}

export const REPO: ApiRepo = { id: 'repo-1', full_name: 'acme/payments-api' };
export const PULL: ApiPull = { id: 'pr-1', number: 482, title: 'T', head_sha: 'abc' };
export const AGENT: ApiAgent = {
  id: 'agent-1',
  name: 'General',
  description: 'General reviewer',
  model: 'gpt',
  enabled: true,
};

export function makeState(over: Partial<FakeApiState> = {}): FakeApiState {
  return {
    repos: [REPO],
    pulls: { [`${REPO.id}#482`]: PULL },
    agents: [AGENT],
    runs: [],
    reviews: [],
    conventions: { scan: null, candidates: [] },
    blast: { changed_symbols: [], downstream: [], summary: '', degraded: false, reason: null },
    startedRunId: 'run-new',
    calls: [],
    ...over,
  };
}

export function fakeApi(state: FakeApiState): DevDigestApi {
  let listRunsCalls = 0;
  return {
    listRepos: async () => (state.calls.push('listRepos'), state.repos),
    getPullByNumber: async (repoId, number) => {
      state.calls.push('getPullByNumber');
      const pull = state.pulls[`${repoId}#${number}`];
      if (!pull) throw new ApiError(404, 'not_found', 'not imported', 'GET pulls');
      return pull;
    },
    refreshPull: async () => void state.calls.push('refreshPull'),
    listAgents: async () => (state.calls.push('listAgents'), state.agents),
    startReview: async () => {
      state.calls.push('startReview');
      state.runs.unshift({ run_id: state.startedRunId, agent_id: AGENT.id, status: 'running', error: null });
      return { runId: state.startedRunId };
    },
    listRuns: async () => {
      state.calls.push('listRuns');
      listRunsCalls++;
      state.onListRuns?.(state, listRunsCalls);
      const err = state.listRunsError?.();
      if (err) throw err;
      return state.runs.map((r) => ({ ...r }));
    },
    listReviews: async () => (state.calls.push('listReviews'), state.reviews),
    getConventions: async () => (state.calls.push('getConventions'), state.conventions),
    getBlastRadius: async () => (state.calls.push('getBlastRadius'), state.blast),
  };
}
