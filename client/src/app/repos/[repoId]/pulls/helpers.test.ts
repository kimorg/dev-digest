import { describe, it, expect } from "vitest";
import type { PrMeta } from "./constants";
import { filterPulls } from "./helpers";

const pr = (over: Partial<PrMeta>): PrMeta => ({ ...({} as PrMeta), title: "", number: 0, ...over });

const PULLS = [
  pr({ number: 1, title: "Add rate limiting", status: "needs_review", updated_at: "2026-10-01T00:00:00Z" }),
  pr({ number: 2, title: "Fix login bug", status: "reviewed", updated_at: "2026-10-03T00:00:00Z" }),
  pr({ number: 3, title: "Bump deps", status: "needs_review", updated_at: null }),
];

describe("filterPulls", () => {
  it("keeps one status, newest first, with missing timestamps last", () => {
    const out = filterPulls(PULLS, { status: "needs_review", query: "", sort: "newest" });
    expect(out.map((p) => p.number)).toEqual([1, 3]);
  });

  it("'all' + 'oldest' sorts ascending across statuses", () => {
    const out = filterPulls(PULLS, { status: "all", query: "", sort: "oldest" });
    expect(out.map((p) => p.number)).toEqual([3, 1, 2]);
  });

  it("searches title (case-insensitive) and number", () => {
    expect(filterPulls(PULLS, { status: "all", query: " LOGIN ", sort: "newest" }).map((p) => p.number)).toEqual([2]);
    expect(filterPulls(PULLS, { status: "all", query: "3", sort: "newest" }).map((p) => p.number)).toEqual([3]);
  });

  it("does not mutate the input list", () => {
    const copy = [...PULLS];
    filterPulls(PULLS, { status: "all", query: "", sort: "oldest" });
    expect(PULLS).toEqual(copy);
  });
});
