import { describe, expect, test } from "vitest";
import { alignResults, OMITTED_EVIDENCE, parseVerdict } from "./llm-judge.js";

const PRACTICES = [
  "a CRITICAL finding cites `import { taskLine } from '../reviews/helpers.js'`",
  "the verdict line says BLOCKED",
  "no finding about rate limiting",
];

describe("alignResults — practice identity", () => {
  test("keys every result by the case-file text, not the judge's paraphrase", () => {
    const raw = [
      { id: 1, practice: "cites the taskLine import", passed: true, evidence: "A2 — taskLine" },
      { id: 2, practice: "verdict BLOCKED", passed: false, evidence: "" },
      { id: 3, passed: true, evidence: "out of scope" },
    ];
    expect(alignResults(raw, PRACTICES).map((r) => r.practice)).toEqual(PRACTICES);
  });

  test("follows id, not array order", () => {
    const raw = [
      { id: 3, passed: true, evidence: "c" },
      { id: 1, passed: false, evidence: "a" },
      { id: 2, passed: true, evidence: "b" },
    ];
    expect(alignResults(raw, PRACTICES).map((r) => r.evidence)).toEqual(["a", "b", "c"]);
  });

  test("accepts a numeric-string id", () => {
    expect(alignResults([{ id: "2", passed: true, evidence: "Verdict: BLOCKED" }], PRACTICES)[1].passed).toBe(true);
  });

  test("a blank string id is not read as 0 — it falls back to the practice text", () => {
    const raw = [{ id: " ", practice: PRACTICES[0], passed: true, evidence: "blank id" }];
    expect(alignResults(raw, PRACTICES)[0]).toEqual({ practice: PRACTICES[0], passed: true, evidence: "blank id" });
  });

  test("falls back to an exact copy of the practice text when there is no id", () => {
    const raw = [{ practice: PRACTICES[2], passed: true, evidence: "x" }];
    expect(alignResults(raw, PRACTICES)[2]).toEqual({ practice: PRACTICES[2], passed: true, evidence: "x" });
  });

  test("an omitted practice is a FAIL with an explanation, so the denominator stays fixed", () => {
    const res = alignResults([{ id: 1, passed: true, evidence: "e" }], PRACTICES);
    expect(res).toHaveLength(3);
    expect(res[1]).toEqual({ practice: PRACTICES[1], passed: false, evidence: OMITTED_EVIDENCE });
    expect(res[2].passed).toBe(false);
  });

  test("ignores out-of-range ids, duplicates after the first, non-objects and unmatched paraphrases", () => {
    const raw = [
      null,
      "PASS",
      { id: 0, passed: true, evidence: "zero" },
      { id: 4, passed: true, evidence: "four" },
      { id: 2, passed: false, evidence: "first" },
      { id: 2, passed: true, evidence: "second" },
      { practice: "verdict is BLOCKED", passed: true, evidence: "paraphrase" },
    ];
    const res = alignResults(raw, PRACTICES);
    expect(res[0].evidence).toBe(OMITTED_EVIDENCE);
    expect(res[1]).toEqual({ practice: PRACTICES[1], passed: false, evidence: "first" });
    expect(res[2].evidence).toBe(OMITTED_EVIDENCE);
  });

  test("only a literal true passes", () => {
    const raw = [
      { id: 1, passed: "true", evidence: "e" },
      { id: 2, passed: 1, evidence: "e" },
      { id: 3, passed: true, evidence: "e" },
    ];
    expect(alignResults(raw, PRACTICES).map((r) => r.passed)).toEqual([false, false, true]);
  });
});

describe("parseVerdict", () => {
  test("reads results[] from JSON wrapped in prose", () => {
    expect(parseVerdict('Here: {"results":[{"id":1,"passed":true,"evidence":"q"}]} done')).toEqual([
      { id: 1, passed: true, evidence: "q" },
    ]);
  });

  test("throws when there is no JSON or no results[]", () => {
    expect(() => parseVerdict("no json")).toThrow(/no JSON/);
    expect(() => parseVerdict('{"verdict":"PASS"}')).toThrow(/missing results/);
  });
});
