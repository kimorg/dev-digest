import type { PrCommit, RunSummary } from "@devdigest/shared";
import { parseTimestamp } from "@/lib/format-date";
import { SHORT_SHA_LENGTH } from "./constants";

export type OutcomeKey = "running" | "error" | "cancelled" | "rejected" | "reviewed" | "approved";

/** The run's badge: the review OUTCOME, not just its lifecycle. A finished run
    that found blockers reads "rejected", never a green "done". Settled runs are
    judged by the denormalized blocker/finding counts on the run row, so the badge
    matches the CI gate (deterministic) rather than the model's verdict. */
export function outcomeOf(run: Pick<RunSummary, "status" | "blockers" | "findings_count">): OutcomeKey {
  if (run.status === "running") return "running";
  if (run.status === "failed") return "error";
  if (run.status === "cancelled") return "cancelled";
  if ((run.blockers ?? 0) > 0) return "rejected";
  if ((run.findings_count ?? 0) > 0) return "reviewed";
  return "approved";
}

/** A run that finished normally (has a score, findings and cost to show). */
export function isRunSettled(run: Pick<RunSummary, "status">): boolean {
  return run.status === "done";
}

/** In-flight runs can't be deleted from history. */
export function isRunDeletable(run: Pick<RunSummary, "status">): boolean {
  return run.status !== "running";
}

export type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Runs and commits interleaved newest-first; items without a time sort last. */
export function buildTimeline(runs: RunSummary[], commits: PrCommit[]): TimelineItem[] {
  return [
    ...runs.map((run) => ({ kind: "run" as const, ts: parseTimestamp(run.ran_at), run })),
    ...commits.map((commit) => ({ kind: "commit" as const, ts: parseTimestamp(commit.committed_at), commit })),
  ].sort((a, b) => b.ts - a.ts);
}

/** Abbreviated commit SHA. */
export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/** A commit message's subject line. */
export function subjectLine(message: string): string {
  return message.split("\n")[0] ?? "";
}
