/**
 * The only non-model tests in the package — pure statistics math and model-provenance helpers
 * on fixed data.
 *   pnpm vitest run src/records/stats.test.ts
 */

import { describe, expect, test } from "vitest";
import { calcStats, computeFlags, formatModels, modelMismatch, modelsOf } from "./stats.js";

const series = (passed: number, total: number) => ({ passed, total, rate: total ? passed / total : 0 });

describe("calcStats", () => {
  test("mean / min / max / sample stddev of a known array", () => {
    const s = calcStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
    // sample stddev (n−1) of this classic array ≈ 2.138 (population would be 2.0)
    expect(s.stddev).toBeCloseTo(2.138, 3);
    expect(s.n).toBe(8);
  });

  test("empty → zeros with n=0; singleton → stddev 0", () => {
    expect(calcStats([])).toEqual({ mean: 0, stddev: 0, min: 0, max: 0, n: 0 });
    expect(calcStats([42])).toEqual({ mean: 42, stddev: 0, min: 42, max: 42, n: 1 });
  });
});

describe("computeFlags", () => {
  test("non_discriminating: 100% in both", () => {
    expect(computeFlags(series(5, 5), series(5, 5))).toContain("non_discriminating");
  });

  test("always_failing (n>0, rate 0) is NOT missing_data", () => {
    const flags = computeFlags(series(0, 5), series(0, 5));
    expect(flags).toContain("always_failing");
    expect(flags).not.toContain("missing_data");
  });

  test("missing_data (n=0) is NOT always_failing", () => {
    const flags = computeFlags(series(0, 0), series(0, 5));
    expect(flags).toContain("missing_data");
    expect(flags).not.toContain("always_failing");
  });

  test("flaky is exclusive of the 20% and 80% boundaries", () => {
    expect(computeFlags(series(1, 2), series(5, 5))).toContain("flaky"); // 50%
    expect(computeFlags(series(1, 5), series(5, 5))).not.toContain("flaky"); // exactly 20%
    expect(computeFlags(series(4, 5), series(5, 5))).not.toContain("flaky"); // exactly 80%
  });

  test("cost_regression when candidate tokens exceed 125% of baseline", () => {
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 130, baseTokens: 100 })).toContain(
      "cost_regression",
    );
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 120, baseTokens: 100 })).not.toContain(
      "cost_regression",
    );
  });
});

describe("model provenance", () => {
  const sub = { backend: "subscription", task_model: "claude-haiku-5-5", judge_model: "claude-sonnet-5-5" };

  test("modelsOf: distinct + sorted per dimension, skipping unrecorded values", () => {
    const m = modelsOf([sub, { ...sub, judge_model: undefined }, { ...sub, task_model: "claude-haiku-4-5" }, {}]);
    expect(m).toEqual({
      backend: ["subscription"],
      task: ["claude-haiku-4-5", "claude-haiku-5-5"],
      judge: ["claude-sonnet-5-5"],
    });
  });

  test("formatModels: names every dimension, 'not recorded' for empty or missing", () => {
    expect(formatModels(modelsOf([sub]))).toBe("subscription · task claude-haiku-5-5 · judge claude-sonnet-5-5");
    expect(formatModels(undefined)).toBe("not recorded · task not recorded · judge not recorded");
  });

  test("modelMismatch: identical models → no warnings", () => {
    expect(modelMismatch(modelsOf([sub]), modelsOf([sub, sub]))).toEqual([]);
  });

  test("modelMismatch: an alias that moved to a newer model is reported", () => {
    const old = modelsOf([{ ...sub, task_model: "claude-haiku-4-5" }]);
    expect(modelMismatch(old, modelsOf([sub]))).toEqual(["task model: claude-haiku-4-5 → claude-haiku-5-5"]);
  });

  test("modelMismatch: same model via another backend still differs (slug formats differ too)", () => {
    const or = modelsOf([{ backend: "openrouter", task_model: "anthropic/claude-haiku-5.5", judge_model: "anthropic/claude-sonnet-5.5" }]);
    expect(modelMismatch(modelsOf([sub]), or)).toHaveLength(3);
  });

  test("modelMismatch: recorded on one side only is reported; on neither side is skipped", () => {
    const legacy = modelsOf([{}]); // rows written before model provenance existed
    expect(modelMismatch(legacy, modelsOf([sub]))).toEqual([
      "backend: not recorded on A side (? → subscription)",
      "task model: not recorded on A side (? → claude-haiku-5-5)",
      "judge model: not recorded on A side (? → claude-sonnet-5-5)",
    ]);
    const workflow = modelsOf([{ backend: "subscription", task_model: "claude-haiku-5-5" }]); // no judge
    expect(modelMismatch(workflow, workflow)).toEqual([]);
    expect(modelMismatch(undefined, undefined)).toEqual([]);
  });
});
