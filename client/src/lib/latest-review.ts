import type { ReviewRecord } from "@devdigest/shared";

/** Each agent's latest review (input newest-first, as GET /pulls/:id/reviews returns it);
    reviews without an agent form one group, `summary` reviews are skipped.
    This rule exists in three copies that must change together: the PR list in
    `server/src/modules/pulls/routes.ts`, `latestReviewIdsPerAgent` in
    `server/src/modules/smart-diff/domain.ts`, and this one. */
export function latestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const seen = new Set<string>();
  return reviews.filter((r) => {
    const key = r.agent_id ?? "";
    if (r.kind !== "review" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
