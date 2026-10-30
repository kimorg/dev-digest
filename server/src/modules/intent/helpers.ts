import type { PrIntentRecord } from '@devdigest/shared';
import type { PrIntentRow } from '../../db/rows.js';
import { PathEscapeError } from '../../platform/errors.js';

/** Pure helpers for the intent module — DB row → DTO mapping, file-read error triage. No I/O. */

export function toPrIntentRecord(row: PrIntentRow): PrIntentRecord {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence,
    sources: row.sources,
    provider: row.provider,
    model: row.model,
    generated_at: row.generatedAt.toISOString(),
  };
}

/** True when a read failed because the path isn't a readable working-tree file (missing, dir, outside the clone). */
export function isUnreadableFileError(err: unknown): boolean {
  if (err instanceof PathEscapeError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR';
}
