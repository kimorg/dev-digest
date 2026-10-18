import { describe, it, expect } from "vitest";
import { toDiffRows } from "./helpers";

describe("toDiffRows", () => {
  it("returns [] when nothing changed", () => {
    expect(toDiffRows("a\nb\n", "a\nb\n")).toEqual([]);
  });

  it("marks removed and added lines", () => {
    expect(toDiffRows("a\nb\n", "a\nc\n")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "c" },
    ]);
  });

  it("collapses unchanged runs beyond the context into a gap", () => {
    const from = ["1", "2", "3", "4", "5", "6", "7"].join("\n");
    const to = ["1", "2", "3", "4", "5", "6", "X"].join("\n");
    expect(toDiffRows(from, to, 1)).toEqual([
      { kind: "gap", count: 5 },
      { kind: "same", text: "6" },
      { kind: "del", text: "7" },
      { kind: "add", text: "X" },
    ]);
  });
});
