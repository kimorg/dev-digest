import { describe, it, expect } from "vitest";
import type { PrCommit, RunSummary } from "@devdigest/shared";
import { buildTimeline, isRunDeletable, outcomeOf, shortSha, subjectLine } from "./helpers";

describe("RunHistory helpers — outcomeOf", () => {
  it("maps lifecycle first, then the settled run's counts", () => {
    expect(outcomeOf({ status: "running", blockers: 3, findings_count: 3 })).toBe("running");
    expect(outcomeOf({ status: "failed", blockers: null, findings_count: null })).toBe("error");
    expect(outcomeOf({ status: "cancelled", blockers: null, findings_count: null })).toBe("cancelled");
    expect(outcomeOf({ status: "done", blockers: 1, findings_count: 4 })).toBe("rejected");
    expect(outcomeOf({ status: "done", blockers: 0, findings_count: 4 })).toBe("reviewed");
    expect(outcomeOf({ status: "done", blockers: null, findings_count: null })).toBe("approved");
  });

  it("only in-flight runs are not deletable", () => {
    expect(isRunDeletable({ status: "running" })).toBe(false);
    expect(isRunDeletable({ status: "done" })).toBe(true);
  });
});

describe("RunHistory helpers — timeline", () => {
  it("interleaves runs and commits newest-first, untimed items last", () => {
    const runs = [
      { run_id: "r1", ran_at: "2026-10-02T00:00:00Z" },
      { run_id: "r2", ran_at: null },
    ] as RunSummary[];
    const commits = [{ sha: "c1", committed_at: "2026-10-03T00:00:00Z" }] as PrCommit[];
    const ids = buildTimeline(runs, commits).map((i) => (i.kind === "run" ? i.run.run_id : i.commit.sha));
    expect(ids).toEqual(["c1", "r1", "r2"]);
  });

  it("formats commit sha and subject", () => {
    expect(shortSha("0123456789abcdef")).toBe("0123456");
    expect(subjectLine("Fix bug\n\nLong body")).toBe("Fix bug");
  });
});
