import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SmartDiffStore } from './ports.js';
import type { FindingAnchor, ReviewHead, SmartDiffSourceFile } from './types.js';

/** Read-only access to `pull_requests`, `pr_files`, `reviews` and `findings` for the smart diff. */
export class SmartDiffRepository implements SmartDiffStore {
  constructor(private db: Db) {}

  /** One round trip: the PR's files joined to the PR row (no files → treated as not found). */
  async listFilesForPull(workspaceId: string, prId: string): Promise<SmartDiffSourceFile[] | undefined> {
    const rows = await this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(eq(t.prFiles.prId, prId));
    return rows.length > 0 ? rows : undefined;
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
