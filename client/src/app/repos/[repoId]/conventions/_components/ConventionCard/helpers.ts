import type { ConventionCandidate } from "@devdigest/shared";

/** Confidence bar colour: ≥ 80 % green, ≥ 60 % amber, below that red. */
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "var(--ok)";
  if (confidence >= 0.6) return "var(--warn)";
  return "var(--crit)";
}

/** "src/api/users.ts:23-31" (or ":23" for one line). */
export function evidenceLocation(c: ConventionCandidate): string {
  const lines =
    c.evidence_line_start === c.evidence_line_end
      ? `${c.evidence_line_start}`
      : `${c.evidence_line_start}-${c.evidence_line_end}`;
  return `${c.evidence_path}:${lines}`;
}
