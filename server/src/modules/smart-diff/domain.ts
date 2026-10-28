import type { SmartDiff, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { ROLE_PATTERNS, SMART_DIFF_CHECK_ORDER, SMART_DIFF_DISPLAY_ORDER } from './constants.js';
import type { FindingAnchor, ReviewHead, SmartDiffSourceFile } from './types.js';

/** Role of a file by its path; first match in check order wins, `core` is the fallback. */
export function classifyFile(path: string): SmartDiffRole {
  for (const role of SMART_DIFF_CHECK_ORDER) {
    if (ROLE_PATTERNS[role].some((re) => re.test(path))) return role;
  }
  return 'core';
}

/**
 * Ids of the latest review per agent (a null agent is one group). `heads` must be
 * newest-first. The "latest review per agent" rule has three copies that must change together:
 * the PR list (`pulls/routes.ts`), this function, and `client/src/lib/latest-review.ts`.
 */
export function latestReviewIdsPerAgent(heads: readonly ReviewHead[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const h of heads) {
    const key = h.agentId ?? '';
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(h.id);
  }
  return ids;
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Group the PR's files by role (always all 5 groups) and attach live finding lines. */
export function buildSmartDiff(
  files: readonly SmartDiffSourceFile[],
  anchors: readonly FindingAnchor[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const a of anchors) {
    if (a.dismissed) continue;
    const set = linesByFile.get(a.file) ?? new Set<number>();
    set.add(a.startLine);
    linesByFile.set(a.file, set);
  }

  const groups = new Map<SmartDiffRole, SmartDiffGroup>(
    SMART_DIFF_DISPLAY_ORDER.map((role) => [role, { role, files: [] }]),
  );
  let totalLines = 0;
  for (const f of [...files].sort((a, b) => byCodeUnit(a.path, b.path))) {
    totalLines += f.additions + f.deletions;
    groups.get(classifyFile(f.path))!.files.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: [...(linesByFile.get(f.path) ?? [])].sort((a, b) => a - b),
    });
  }

  return {
    groups: SMART_DIFF_DISPLAY_ORDER.map((role) => groups.get(role)!),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
