import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { allFindings, canComment, lethalTrifectaFindings } from "./helpers";

const f = (id: string, kind: FindingRecord["kind"] = "finding") => ({ id, kind }) as FindingRecord;
const review = (findings: FindingRecord[]) => ({ findings }) as ReviewRecord;

describe("PrDetailView helpers", () => {
  it("flattens findings across runs and picks the lethal-trifecta ones", () => {
    const all = allFindings([review([f("a")]), review([f("b", "lethal_trifecta"), f("c")])]);
    expect(all.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(lethalTrifectaFindings(all).map((x) => x.id)).toEqual(["b"]);
  });

  it("allows comments only on open PRs", () => {
    expect(canComment({ status: "open" })).toBe(true);
    expect(canComment({ status: "merged" })).toBe(false);
    expect(canComment({ status: "closed" })).toBe(false);
  });
});
