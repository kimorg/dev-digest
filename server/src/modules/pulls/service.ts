import type { PrMeta } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { PullStore } from './ports.js';

/** Pull-request lookups that only read the DB (no GitHub sync, no writes). */
export class PullService {
  constructor(private store: PullStore) {}

  async getByNumber(workspaceId: string, repoId: string, number: number): Promise<PrMeta> {
    const fullName = await this.store.getRepoFullName(workspaceId, repoId);
    if (!fullName) throw new NotFoundError('Repo not found');
    const pull = await this.store.getPullByNumber(workspaceId, repoId, number);
    if (!pull) {
      throw new NotFoundError(
        `PR #${number} is not imported for ${fullName}. Open the repo's Pull requests list in DevDigest (it syncs from GitHub), then retry.`,
      );
    }
    return pull;
  }
}
