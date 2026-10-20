import type { FindingRecord, Severity } from "@devdigest/shared";
import { sortBySeverity } from "@/components/findings-severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Optionally keep one severity, drop low-confidence findings, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (severity) shown = shown.filter((f) => f.severity === severity);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return sortBySeverity(shown);
}
