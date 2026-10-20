import type { ConventionCandidate, ConventionScan, ConventionStatus } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import { PathEscapeError } from '../../platform/errors.js';

/** Pure helpers for the conventions module — DB row → DTO mapping, file-read error triage. No I/O. */

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line_start: row.evidenceLineStart ?? 0,
    evidence_line_end: row.evidenceLineEnd ?? 0,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status,
    model: row.model,
    head_sha: row.headSha,
    sample_files: row.sampleFiles,
    sample_count: row.sampleFiles.length,
    candidate_count: row.candidateCount,
    dropped_count: row.droppedCount,
    error: row.error,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a file read failed because the path isn't a readable working-tree file
 * (missing, a dir, or outside the clone / under `.git/`) — the scan skips it, it doesn't fail.
 */
export function isUnreadableFileError(err: unknown): boolean {
  if (err instanceof PathEscapeError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR';
}
