import { describe, it, expect } from "vitest";
import type { ContextDocument } from "@devdigest/shared";
import { matchesPath, moveAttached, sumAttachedTokens, toContextRows, toggleAttached } from "./helpers";

const doc = (path: string, tokens = 10, extra: Partial<ContextDocument> = {}): ContextDocument => ({
  path,
  name: path.split("/").pop()!,
  dir: path.split("/").slice(0, -1).join("/"),
  type: "docs",
  size_bytes: 100,
  tokens,
  too_large: false,
  used_by: { agents: 0, skills: 0 },
  ...extra,
});

describe("moveAttached — AC-23, AC-57, AC-58, EC-18", () => {
  const paths = ["a.md", "b.md", "c.md"];

  it("moves a row to the position of the row it is dropped on", () => {
    expect(moveAttached(paths, "a.md", "c.md")).toEqual(["b.md", "c.md", "a.md"]);
    expect(moveAttached(paths, "c.md", "a.md")).toEqual(["c.md", "a.md", "b.md"]);
  });

  it("a drop below the attached rows (over an unattached path) places the row last", () => {
    expect(moveAttached(paths, "a.md", "unattached.md")).toEqual(["b.md", "c.md", "a.md"]);
  });

  it("the outermost rows stay put when pushed past the ends (same reference, nothing to save)", () => {
    expect(moveAttached(paths, "a.md", "a.md")).toBe(paths);
    expect(moveAttached(paths, "c.md", "unattached.md")).toBe(paths);
  });

  it("zero or one attached rows → same reference", () => {
    const none: string[] = [];
    const one = ["a.md"];
    expect(moveAttached(none, "a.md", "b.md")).toBe(none);
    expect(moveAttached(one, "a.md", "b.md")).toBe(one);
  });

  it("an unattached row cannot be moved", () => {
    expect(moveAttached(paths, "x.md", "a.md")).toBe(paths);
  });
});

describe("toggleAttached — AC-21, AC-22", () => {
  it("checking appends at the end; unchecking removes and keeps the order", () => {
    expect(toggleAttached(["a.md", "b.md"], "c.md", true)).toEqual(["a.md", "b.md", "c.md"]);
    expect(toggleAttached(["a.md", "b.md", "c.md"], "b.md", false)).toEqual(["a.md", "c.md"]);
  });
});

describe("toContextRows — AC-27, AC-28, AC-20", () => {
  it("attached first in saved order (missing ones kept, no tokens), then the rest sorted by path", () => {
    const docs = [doc("z.md", 5), doc("m.md", 7), doc("a.md", 3)];
    const { attached, unattached } = toContextRows(docs, ["z.md", "gone.md"]);
    expect(attached.map((r) => r.path)).toEqual(["z.md", "gone.md"]);
    expect(attached[1]).toMatchObject({ isMissing: true, tokens: 0 });
    expect(unattached.map((r) => r.path)).toEqual(["a.md", "m.md"]);
    expect(sumAttachedTokens(attached)).toBe(5);
  });
});

describe("matchesPath — AC-25", () => {
  it("is a case-insensitive 'contains'; blank matches all", () => {
    expect(matchesPath({ path: "server/docs/Auth.md" }, "AUTH")).toBe(true);
    expect(matchesPath({ path: "server/docs/Auth.md" }, "nope")).toBe(false);
    expect(matchesPath({ path: "x.md" }, "  ")).toBe(true);
  });
});
