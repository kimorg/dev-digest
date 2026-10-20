import { describe, it, expect } from "vitest";
import type { SkillListItem } from "@devdigest/shared";
import { changedFields } from "./helpers";

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
  it("changedFields sends only what differs (names trimmed)", () => {
    const form = { name: " PR Quality Rubric ", description: "Score the PR.", type: "rubric" as const, body: "# v2" };
    expect(changedFields(form, SKILL)).toEqual({ body: "# v2" });
    expect(changedFields({ ...form, body: "# Rubric" }, SKILL)).toEqual({});
  });
});
