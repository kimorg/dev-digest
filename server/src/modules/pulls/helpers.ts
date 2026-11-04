import type { PrMeta } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import { deriveReviewStatus } from './status.js';

/** `pull_requests` row → `PrMeta` without the list-only rollups (score, cost, findings counts). */
export function toPrMeta(row: PullRow, now: number): PrMeta {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    head_sha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    files_count: row.filesCount,
    status: deriveReviewStatus({
      ghStatus: row.status,
      lastReviewedSha: row.lastReviewedSha,
      headSha: row.headSha,
      updatedAt: row.updatedAt,
      now,
    }),
    opened_at: row.openedAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
  };
}
