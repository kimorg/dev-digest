import type { ConventionCandidate } from "@devdigest/shared";

export function countAccepted(candidates: ConventionCandidate[]): number {
  return candidates.filter((c) => c.status === "accepted").length;
}
