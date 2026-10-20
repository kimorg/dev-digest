/** Constants shared by the PR-detail components (/repos/:repoId/pulls/:number). */

import type { IconName } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";

/** PR-detail tabs (?tab=), in display order. The first is the default. */
export const PR_TABS = ["overview", "findings", "diff"] as const;
export type PrTab = (typeof PR_TABS)[number];

/** Per-verdict visual meta (VerdictBanner + the review-run header badge).
    `labelKey` resolves under the `prReview.verdict` namespace. */
export const VERDICT_META: Record<
  Verdict,
  { c: string; bg: string; icon: IconName; labelKey: string }
> = {
  request_changes: {
    c: "var(--crit)",
    bg: "var(--crit-bg)",
    icon: "XCircle",
    labelKey: "requestChanges",
  },
  approve: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", labelKey: "approve" },
  comment: { c: "var(--info)", bg: "var(--info-bg)", icon: "MessageSquare", labelKey: "comment" },
};
