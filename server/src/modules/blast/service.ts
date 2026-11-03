import type { BlastRadius } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { blastSource, toBlastRadius } from './domain.js';
import type { BlastIndex, BlastStore } from './ports.js';
import type { BlastSource } from './types.js';

export interface BlastServiceDeps {
  store: BlastStore;
  index: BlastIndex;
}

/** Blast radius of a PR: one repo-intel read mapped to the contract. No model, no GitHub. */
export class BlastService {
  private store: BlastStore;
  private index: BlastIndex;

  constructor(deps: BlastServiceDeps) {
    this.store = deps.store;
    this.index = deps.index;
  }

  async get(workspaceId: string, prId: string): Promise<{ blast: BlastRadius; source: BlastSource }> {
    const target = await this.store.getTargetForPull(workspaceId, prId);
    if (!target) throw new NotFoundError('Pull request not found');
    const read = await this.index.getBlastRadius(target.repoId, target.files);
    return { blast: toBlastRadius(read), source: blastSource(read) };
  }
}
