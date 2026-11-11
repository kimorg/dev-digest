/* Helpers shared by the PR-detail components (/repos/:repoId/pulls/:number). */
import type { LogLine } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

/** Critical findings still open (not dismissed) — the live "blockers" count in a
    review-run header and in the PR brief banner. Updates as findings are dismissed,
    unlike the run row's `blockers`, which the server snapshots under the agent's
    CI fail-on policy. */
export function countOpenCriticals(findings: Pick<FindingRecord, "severity" | "dismissed_at">[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}

interface RawRunEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawRunEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}
