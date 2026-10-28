/** Pure helpers for the Files changed tab. */
import type { ReactNode } from "react";
import { SEV } from "@devdigest/ui";
import type { DiffAnnotation } from "@/components/diff-viewer";
import { latestReviewPerAgent } from "@/lib/latest-review";
import type { FindingRecord, PrFile, ReviewRecord, Severity, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import { COLLAPSED_ROLES, LINE_LABEL } from "./constants";

export interface DiffFindings {
  /** Findings of each agent's latest review, grouped by file path. */
  byFile: Map<string, FindingRecord[]>;
  /** Paths with at least one live (not dismissed) finding. */
  flaggedPaths: Set<string>;
  /** Whether any review has run for the PR. */
  reviewed: boolean;
}

/** One source for card, dot and counter: the latest `review` per agent; dismissed ones don't flag. */
export function collectDiffFindings(reviews: ReviewRecord[]): DiffFindings {
  const latest = latestReviewPerAgent(reviews);
  const byFile = new Map<string, FindingRecord[]>();
  const flaggedPaths = new Set<string>();
  for (const r of latest) {
    for (const f of r.findings) {
      byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
      if (!f.dismissed_at) flaggedPaths.add(f.file);
    }
  }
  return { byFile, flaggedPaths, reviewed: latest.length > 0 };
}

export interface RoleGroupData {
  role: SmartDiffRole;
  files: PrFile[];
}

/** The server's 5 groups, with each file's patch looked up by path (missing → null). */
export function toRoleGroups(smartDiff: SmartDiffResponse, files: PrFile[]): RoleGroupData[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  return smartDiff.groups.map((g) => ({
    role: g.role,
    files: g.files.map((sf) => byPath.get(sf.path) ?? { path: sf.path, additions: sf.additions, deletions: sf.deletions, patch: null }),
  }));
}

/**
 * Docs/boilerplate and empty groups start collapsed; core/tests/wiring always start open,
 * whatever their size (big files inside still collapse by FileCard's own rule).
 */
export function groupDefaultOpen(role: SmartDiffRole, files: PrFile[]): boolean {
  return files.length > 0 && !COLLAPSED_ROLES.has(role);
}

/** i18n key (under `smartDiff.lineLabel`) for a severity; an unknown severity reads as a suggestion. */
export function lineLabelKey(severity: string): (typeof LINE_LABEL)[Severity] {
  return LINE_LABEL[severity as Severity] ?? LINE_LABEL.SUGGESTION;
}

/** How many of the files carry a live finding. */
export function countFlagged(files: PrFile[], flaggedPaths: ReadonlySet<string>): number {
  return files.filter((f) => flaggedPaths.has(f.path)).length;
}

export function diffStats(files: PrFile[]): { count: number; additions: number; deletions: number } {
  return {
    count: files.length,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
  };
}

/** A finding as a diff annotation; a dismissed one stays (muted card) but draws no bar/dot. */
export function toFindingAnnotation(f: FindingRecord, label: string, body: ReactNode): DiffAnnotation {
  const sev = SEV[f.severity as Severity];
  return {
    id: f.id,
    line: f.start_line,
    mark: f.dismissed_at || !sev ? null : { color: sev.c, icon: sev.icon, label },
    body,
  };
}
