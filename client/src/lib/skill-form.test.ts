import { describe, it, expect } from "vitest";
import { ApiError } from "./api";
import { estimateTokens, isNameTakenError, toSkillFileName } from "./skill-form";

describe("skill-form helpers", () => {
  it("toSkillFileName slugs the name", () => {
    expect(toSkillFileName("PR Quality Rubric")).toBe("pr-quality-rubric.md");
    expect(toSkillFileName("No .then() Chains!")).toBe("no-then-chains.md");
    expect(toSkillFileName("   ")).toBe("skill.md");
  });

  it("estimateTokens is ~4 chars per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("12345")).toBe(2);
  });

  it("isNameTakenError is a 409 from the API", () => {
    expect(isNameTakenError(new ApiError("taken", 409, "skill_name_taken"))).toBe(true);
    expect(isNameTakenError(new ApiError("bad", 422))).toBe(false);
    expect(isNameTakenError(new Error("x"))).toBe(false);
  });
});
