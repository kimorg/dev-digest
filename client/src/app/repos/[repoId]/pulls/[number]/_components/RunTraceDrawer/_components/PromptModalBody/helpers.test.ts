import { describe, it, expect } from "vitest";
import { splitMatches } from "./helpers";

describe("splitMatches", () => {
  it("returns the whole line when there is no query", () => {
    expect(splitMatches("abc", "")).toEqual([{ text: "abc", match: false }]);
  });

  it("marks every case-insensitive occurrence, keeping the original casing", () => {
    expect(splitMatches("Foo bar foo", "foo")).toEqual([
      { text: "Foo", match: true },
      { text: " bar ", match: false },
      { text: "foo", match: true },
    ]);
  });

  it("returns no segments for an empty line with a query", () => {
    expect(splitMatches("", "x")).toEqual([]);
  });
});
