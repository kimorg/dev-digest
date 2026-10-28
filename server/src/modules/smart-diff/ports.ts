import type { FindingAnchor, ReviewHead, SmartDiffSourceFile } from './types.js';

/**
 * What the smart-diff service needs from storage, in module types. wiring.ts plugs in
 * the Postgres implementation. Read-only; the PR lookup is workspace-scoped.
 */
export interface SmartDiffStore {
  /** The PR's files, or `undefined` when the PR is not in the workspace. */
  listFilesForPull(workspaceId: string, prId: string): Promise<SmartDiffSourceFile[] | undefined>;
  /** `kind = 'review'` reviews of the PR, newest first. */
  listReviewsForPull(prId: string): Promise<ReviewHead[]>;
  listFindingAnchorsForReviews(reviewIds: readonly string[]): Promise<FindingAnchor[]>;
}
