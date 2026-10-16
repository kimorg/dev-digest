import type { FindingRecord } from "@devdigest/shared";

/** Critical findings still open (not dismissed) — the live "blockers" count in a
    review-run header. Updates as findings are dismissed, unlike the run row's
    `blockers`, which the server snapshots under the agent's CI fail-on policy. */
export function countOpenCriticals(findings: Pick<FindingRecord, "severity" | "dismissed_at">[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}
