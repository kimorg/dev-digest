import type { ReviewRecord } from "@devdigest/shared";
// Deep import on purpose: a runtime import from the barrel makes webpack bundle it, and its
// `./contracts/*.js` specifiers do not resolve to `.ts` files in the Next build.
import { pickLatestPerAgent } from "@devdigest/shared/rules/latest-per-agent";

/** Each agent's latest review (input newest-first, as GET /pulls/:id/reviews returns it);
    reviews without an agent form one group, `summary` reviews are skipped.
    The per-agent rule itself is `pickLatestPerAgent` in `@devdigest/shared`. */
export function latestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  return pickLatestPerAgent(
    reviews.filter((r) => r.kind === "review"),
    (r) => r.agent_id,
  );
}
