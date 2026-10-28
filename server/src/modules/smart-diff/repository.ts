import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SmartDiffStore } from './ports.js';
import type { FindingAnchor, ReviewHead, SmartDiffSourceFile } from './types.js';

/** Read-only access to `pull_requests`, `pr_files`, `reviews` and `findings` for the smart diff. */
export class SmartDiffRepository implements SmartDiffStore {
  constructor(private db: Db) {}

  async listFilesForPull(workspaceId: string, prId: string): Promise<SmartDiffSourceFile[] | undefined> {
    const [pull] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async listReviewsForPull(prId: string): Promise<ReviewHead[]> {
    return this.db
      .select({ id: t.reviews.id, agentId: t.reviews.agentId })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async listFindingAnchorsForReviews(reviewIds: readonly string[]): Promise<FindingAnchor[]> {
    if (reviewIds.length === 0) return [];
    const rows = await this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine, dismissedAt: t.findings.dismissedAt })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, [...reviewIds]));
    return rows.map((r) => ({ file: r.file, startLine: r.startLine, dismissed: r.dismissedAt !== null }));
  }
}
