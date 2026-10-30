import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord } from "@devdigest/shared";
import { collectDiffFindings, countFlagged, groupDefaultOpen, lineLabelKey } from "./helpers";

const file = (path: string, additions = 1, deletions = 0): PrFile => ({ path, additions, deletions, patch: null });

function finding(id: string, fileName: string, dismissed = false): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: id,
    file: fileName,
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.5,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r",
    accepted_at: null,
    dismissed_at: dismissed ? "2026-10-28T00:00:00Z" : null,
  };
}

function review(id: string, agent: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "p",
    agent_id: agent,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-10-28T00:00:00Z",
    findings,
  };
}

describe("DiffTab helpers — labels and counters", () => {
  it("maps severities to line labels with one fallback", () => {
    expect(lineLabelKey("CRITICAL")).toBe("blocker");
    expect(lineLabelKey("WARNING")).toBe("warning");
    expect(lineLabelKey("SUGGESTION")).toBe("suggestion");
    expect(lineLabelKey("INFO")).toBe("suggestion");
  });

  it("counts files with a live finding, not findings", () => {
    const { flaggedPaths } = collectDiffFindings([
      review("new", "a", [finding("f1", "a.ts"), finding("f2", "a.ts"), finding("f3", "c.ts", true)]),
      review("old", "a", [finding("f4", "b.ts")]),
    ]);
    expect(countFlagged([file("a.ts"), file("b.ts"), file("c.ts")], flaggedPaths)).toBe(1);
  });

  it("opens core/tests/wiring at any size, keeps docs/boilerplate and empty groups collapsed", () => {
    expect(groupDefaultOpen("core", [file("a.ts", 100, 100)])).toBe(true);
    expect(groupDefaultOpen("core", [file("a.ts", 900, 101)])).toBe(true);
    expect(groupDefaultOpen("tests", [file("a.test.ts", 500, 0)])).toBe(true);
    expect(groupDefaultOpen("wiring", [file("index.ts", 500, 0)])).toBe(true);
    expect(groupDefaultOpen("docs", [file("a.md")])).toBe(false);
    expect(groupDefaultOpen("boilerplate", [file("a.lock")])).toBe(false);
    expect(groupDefaultOpen("core", [])).toBe(false);
  });
});
