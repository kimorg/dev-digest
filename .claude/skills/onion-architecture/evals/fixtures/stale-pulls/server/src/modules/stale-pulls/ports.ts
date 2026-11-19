import type { StalePull } from './types.js';

export interface StalePullStore {
  listOpenPullsUpdatedBefore(
    workspaceId: string,
    repoId: string,
    cutoff: Date,
    limit: number,
  ): Promise<StalePull[]>;
}
