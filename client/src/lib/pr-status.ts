/* pr-status.ts — rules over a PR's review status, shared by the PR list and the
   app shell's sidebar badge. Open PRs carry a derived review status
   (needs_review / reviewed / stale); everything else is merged/closed. */
import type { PrMeta } from "./types";

/** Statuses an open PR can have. */
export const OPEN_STATUSES: ReadonlySet<string> = new Set(["needs_review", "reviewed", "stale"]);

/** Number of PRs that are still open. */
export function countOpen(pulls: Pick<PrMeta, "status">[]): number {
  return pulls.filter((p) => OPEN_STATUSES.has(p.status)).length;
}

/** Number of PRs that still need a review. */
export function countNeedsReview(pulls: Pick<PrMeta, "status">[]): number {
  return pulls.filter((p) => p.status === "needs_review").length;
}
