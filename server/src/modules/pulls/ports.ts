import type { PrMeta } from '@devdigest/shared';

/**
 * What the pulls service needs from storage, in contract types. wiring.ts plugs in the
 * Postgres implementation. Read-only; every lookup is workspace-scoped.
 */
export interface PullStore {
  /** The repo's `owner/name`, or `undefined` when the repo is not in the workspace. */
  getRepoFullName(workspaceId: string, repoId: string): Promise<string | undefined>;
  /** The imported PR with this number, or `undefined` when it is not in the DB. */
  getPullByNumber(workspaceId: string, repoId: string, number: number): Promise<PrMeta | undefined>;
}
