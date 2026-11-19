import type { AssociatedPullRef, RepoRef } from '@devdigest/shared';
import type { PullForHistory } from './types.js';

/** Storage the history lookup needs. The PR lookup is workspace-scoped. */
export interface PrHistoryStore {
  /** The PR's repo, base branch, head sha and files, or `undefined` when it is not in the workspace. */
  getPullForHistory(workspaceId: string, prId: string): Promise<PullForHistory | undefined>;
}

/** The two GitHub reads the lookup makes (a narrowing of `GitHubClient`). */
export interface PullHistorySource {
  listCommitShasForPath(repo: RepoRef, path: string, opts: { ref: string; limit: number }): Promise<string[]>;
  listPullsForCommit(repo: RepoRef, sha: string): Promise<AssociatedPullRef[]>;
}
