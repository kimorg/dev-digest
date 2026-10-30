import { describe, it, expect } from "vitest";
import type { ReviewRecord } from "@devdigest/shared";
import { latestReviewPerAgent } from "./latest-review";

function review(id: string, agentId: string | null, kind: ReviewRecord["kind"] = "review"): ReviewRecord {
  return {
    id,
    pr_id: "p1",
    agent_id: agentId,
    run_id: null,
    kind,
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-10-01T00:00:00Z",
    findings: [],
  };
}

describe("latestReviewPerAgent", () => {
  it("keeps the newest review of each agent (agent-less reviews are one group), skips summaries", () => {
    const picked = latestReviewPerAgent([
      review("a2", "agentA"),
      review("sum", "agentB", "summary"),
      review("b1", "agentB"),
      review("a1", "agentA"),
      review("n2", null),
      review("n1", null),
    ]);
    expect(picked.map((r) => r.id)).toEqual(["a2", "b1", "n2"]);
  });
});
