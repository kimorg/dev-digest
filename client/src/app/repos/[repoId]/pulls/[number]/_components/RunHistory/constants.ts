import type { IconName } from "@devdigest/ui";
import type { OutcomeKey } from "./helpers";

/** Badge look per run outcome; the label is `prReview.runStatus.<key>`. */
export const OUTCOME_META: Record<OutcomeKey, { color: string; bg: string; icon: IconName }> = {
  running: { color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" },
  error: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  cancelled: { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" },
  rejected: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  reviewed: { color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" },
  approved: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" },
};

/** Commit SHAs are shown abbreviated, like git does. */
export const SHORT_SHA_LENGTH = 7;
