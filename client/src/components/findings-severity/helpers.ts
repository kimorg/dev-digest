import type { FindingRecord, FindingsCounts, Severity } from "@devdigest/shared";
import { POPOVER_EDGE, POPOVER_GAP, POPOVER_MAX_HEIGHT, POPOVER_WIDTH } from "./constants";

/** Display order + the `FindingsCounts` key for each severity. */
export const SEVERITY_KEYS: { severity: Severity; key: keyof FindingsCounts }[] = [
  { severity: "CRITICAL", key: "critical" },
  { severity: "WARNING", key: "warning" },
  { severity: "SUGGESTION", key: "suggestion" },
];

/** Per-severity counts of a findings list (dismissed findings included). */
export function countBySeverity(findings: Pick<FindingRecord, "severity">[]): FindingsCounts {
  const counts: FindingsCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    const key = SEVERITY_KEYS.find((k) => k.severity === f.severity)?.key;
    if (key) counts[key] += 1;
  }
  return counts;
}

/** Findings ordered CRITICAL → WARNING → SUGGESTION (stable within a severity). */
export function sortBySeverity<T extends Pick<FindingRecord, "severity">>(findings: T[]): T[] {
  const rank = (f: T) => {
    const i = SEVERITY_KEYS.findIndex((k) => k.severity === f.severity);
    return i === -1 ? SEVERITY_KEYS.length : i;
  };
  return [...findings].sort((x, y) => rank(x) - rank(y));
}

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** One severity's findings, or all of them ordered by severity when `severity` is null. */
export function pickFindings(findings: FindingRecord[], severity: Severity | null): FindingRecord[] {
  return severity ? findings.filter((f) => f.severity === severity) : sortBySeverity(findings);
}

/** Markdown rationale → one plain-text line for the 2-line clamp. */
export function plainText(md: string): string {
  return md.replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
}

export type Placement = { left: number; top?: number; bottom?: number };

/** Fixed-position placement under `anchor`, kept inside the viewport; flips above
    the trigger when there's no room below (bottom rows of a table). */
export function placeUnder(anchor: HTMLElement): Placement {
  const r = anchor.getBoundingClientRect();
  const left = Math.max(POPOVER_EDGE, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - POPOVER_EDGE));
  if (r.bottom + POPOVER_GAP + POPOVER_MAX_HEIGHT > window.innerHeight && r.top > window.innerHeight - r.bottom) {
    return { left, bottom: window.innerHeight - r.top + POPOVER_GAP };
  }
  return { left, top: r.bottom + POPOVER_GAP };
}
