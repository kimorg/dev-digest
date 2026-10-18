import { describe, it, expect } from "vitest";
import type { SkillListItem } from "@devdigest/shared";
import { changedFields, estimateTokens, toSkillFileName } from "./helpers";

const SKILL: SkillListItem = {
  id: "s1",
  name: "PR Quality Rubric",
  description: "Score the PR.",
  type: "rubric",
  source: "manual",
  body: "# Rubric",
  enabled: true,
  version: 1,
  agent_count: 0,
  created_at: "2026-10-17T10:00:00.000Z",
  updated_at: "2026-10-17T10:00:00.000Z",
};

describe("skill ConfigTab helpers", () => {
  it("toSkillFileName slugs the name", () => {
    expect(toSkillFileName("PR Quality Rubric")).toBe("pr-quality-rubric.md");
    expect(toSkillFileName("No .then() Chains!")).toBe("no-then-chains.md");
    expect(toSkillFileName("   ")).toBe("skill.md");
  });

  it("estimateTokens is ~4 chars per token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("12345")).toBe(2);
  });

  it("changedFields sends only what differs (names trimmed)", () => {
    const form = { name: " PR Quality Rubric ", description: "Score the PR.", type: "rubric" as const, body: "# v2" };
    expect(changedFields(form, SKILL)).toEqual({ body: "# v2" });
    expect(changedFields({ ...form, body: "# Rubric" }, SKILL)).toEqual({});
  });
});
