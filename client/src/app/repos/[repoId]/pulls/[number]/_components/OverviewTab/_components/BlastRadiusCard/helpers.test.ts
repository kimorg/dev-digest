import { describe, it, expect } from "vitest";
import { blastStats, canResync, indexAdvanced, pathSegments, symbolLabel } from "./helpers";

describe("blast card helpers", () => {
  it("pathSegments splits after every slash and joins back to the input", () => {
    const p = "client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx:43";
    expect(pathSegments(p)).toEqual([
      "client/", "src/", "app/", "agents/", "[id]/", "_components/", "AgentEditor/", "AgentEditor.test.tsx:43",
    ]);
    expect(pathSegments(p).join("")).toBe(p);
    expect(pathSegments("file.ts:1")).toEqual(["file.ts:1"]);
  });

  it("canResync is true only for reasons a resync can fix", () => {
    expect(canResync("index_failed")).toBe(true);
    expect(canResync("index_partial")).toBe(true);
    expect(canResync("no_data")).toBe(true);
    expect(canResync("flag_off")).toBe(false);
    expect(canResync("repo_too_large")).toBe(false);
  });

  it("indexAdvanced: nothing yet, first index, new sha, new updatedAt, no change", () => {
    const a = { lastIndexedSha: "a", updatedAt: "t1" };
    expect(indexAdvanced(undefined, undefined)).toBe(false);
    expect(indexAdvanced(undefined, a)).toBe(true);
    expect(indexAdvanced(a, { ...a, lastIndexedSha: "b" })).toBe(true);
    expect(indexAdvanced(a, { ...a, updatedAt: "t2" })).toBe(true);
    expect(indexAdvanced(a, { ...a })).toBe(false);
  });

  it("symbolLabel adds parentheses for callables; blastStats counts endpoints once", () => {
    expect(symbolLabel("run", "function")).toBe("run()");
    expect(symbolLabel("run", "method")).toBe("run()");
    expect(symbolLabel("Cfg", "interface")).toBe("Cfg");
    const impact = (symbol: string) => ({
      symbol,
      callers: [{ name: "n", file: "f", line: 1 }],
      endpoints_affected: ["GET /x"],
      crons_affected: [],
    });
    expect(
      blastStats({
        changed_symbols: [],
        downstream: [impact("a"), impact("b")],
        summary: "",
        degraded: false,
        reason: null,
        caller_facts: [],
      }),
    ).toEqual({ symbols: 0, callers: 2, endpoints: 1, crons: 0 });
  });
});
