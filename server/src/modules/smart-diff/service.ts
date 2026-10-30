import type { SmartDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff, latestReviewIdsPerAgent } from './domain.js';
import type { SmartDiffStore } from './ports.js';

/** Smart diff: PR files grouped by role + the lines that carry live findings. DB only. */
export class SmartDiffService {
  constructor(private store: SmartDiffStore) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiff> {
    const files = await this.store.listFilesForPull(workspaceId, prId);
    if (!files) throw new NotFoundError('Pull request not found');
    const heads = await this.store.listReviewsForPull(prId);
    const latest = latestReviewIdsPerAgent(heads);
    const anchors = latest.length > 0 ? await this.store.listFindingAnchorsForReviews(latest) : [];
    return buildSmartDiff(files, anchors);
  }
}
