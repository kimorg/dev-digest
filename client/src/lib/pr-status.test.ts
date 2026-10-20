import { describe, it, expect } from "vitest";
import { countNeedsReview, countOpen } from "./pr-status";

import type { PrMeta } from "./types";

const pulls: Pick<PrMeta, "status">[] = [
  { status: "needs_review" },
  { status: "needs_review" },
  { status: "reviewed" },
  { status: "stale" },
  { status: "merged" },
  { status: "closed" },
];

describe("pr-status", () => {
  it("counts open PRs (any derived review status)", () => {
    expect(countOpen(pulls)).toBe(4);
  });

  it("counts PRs that still need review", () => {
    expect(countNeedsReview(pulls)).toBe(2);
    expect(countNeedsReview([])).toBe(0);
  });
});
