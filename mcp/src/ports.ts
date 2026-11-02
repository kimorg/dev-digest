/** The port the core needs: the DevDigest HTTP API, shaped by this package's use cases. */
import type {
  ApiAgent,
  ApiConventions,
  ApiPull,
  ApiRepo,
  ApiReview,
  ApiRun,
} from './types.js';

export interface DevDigestApi {
  listRepos(): Promise<ApiRepo[]>;
  /** Read-only lookup; rejects with `ApiError` (404) when the PR is not imported. */
  getPullByNumber(repoId: string, number: number): Promise<ApiPull>;
  /** `GET /pulls/:id` — primes `pr_files` the way the UI does; the body is ignored. */
  refreshPull(prId: string): Promise<void>;
  listAgents(): Promise<ApiAgent[]>;
  /** Starts a run and returns its id. */
  startReview(prId: string, agentId: string): Promise<{ runId: string }>;
  /** Run history of the PR, newest first. */
  listRuns(prId: string): Promise<ApiRun[]>;
  /** Reviews of the PR, newest first. */
  listReviews(prId: string): Promise<ApiReview[]>;
  getConventions(repoId: string): Promise<ApiConventions>;
}
