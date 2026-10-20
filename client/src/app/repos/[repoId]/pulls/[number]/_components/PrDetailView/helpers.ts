import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { PrDetail } from "@/lib/types";

/** Every finding across the PR's review runs. */
export function allFindings(reviews: ReviewRecord[]): FindingRecord[] {
  return reviews.flatMap((r) => r.findings);
}

/** Findings that flag the lethal trifecta (shown as a banner above the runs). */
export function lethalTrifectaFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.kind === "lethal_trifecta");
}

/** Inline comments can only be posted on an open PR. */
export function canComment(pr: Pick<PrDetail, "status">): boolean {
  return pr.status === "open";
}
