import type { Db } from '../../db/client.js';
import { DEFAULT_STALE_AFTER_DAYS, MAX_STALE_PULLS } from './constants.js';
import { sortByOldest, staleCutoff } from './domain.js';
import type { StalePullStore } from './ports.js';
import { StalePullsRepository } from './repository.js';
import type { StalePull } from './types.js';

export class StalePullsService {
  private store: StalePullStore;
  private staleAfterDays: number;

  constructor(
    db: Db,
    private now: () => number = Date.now,
  ) {
    this.store = new StalePullsRepository(db);
    this.staleAfterDays = Number(process.env.STALE_PULL_DAYS ?? DEFAULT_STALE_AFTER_DAYS);
  }

  async list(workspaceId: string, repoId: string): Promise<StalePull[]> {
    const cutoff = staleCutoff(this.now(), this.staleAfterDays);
    const pulls = await this.store.listOpenPullsUpdatedBefore(workspaceId, repoId, cutoff, MAX_STALE_PULLS);
    sortByOldest(pulls);
    return pulls;
  }
}
