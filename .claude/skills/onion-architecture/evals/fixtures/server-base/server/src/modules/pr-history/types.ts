import type { RepoRef } from '@devdigest/shared';

export interface HistoryFile {
  path: string;
  additions: number;
  deletions: number;
}

/** What the lookup needs to know about a PR. */
export interface PullForHistory {
  repo: RepoRef;
  number: number;
  base: string;
  headSha: string;
  files: HistoryFile[];
}

/** A commit sha and the queried files it touched. */
export interface ShaHit {
  sha: string;
  paths: string[];
}
