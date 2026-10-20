import { describe, it, expect } from "vitest";
import type { SkillListItem } from "@devdigest/shared";
import { matchesName, moveLink, toAgentSkillRows, toggleLink } from "./helpers";

const sk = (id: string, name: string, created_at = "2026-10-17T10:00:00.000Z"): SkillListItem => ({
  id,
  name,
  description: "d",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  agent_count: 0,
  created_at,
  updated_at: "2026-10-17T10:00:00.000Z",
});

describe("SkillsTab helpers", () => {
  it("toAgentSkillRows: linked in link order, the rest by name on equal dates, dangling links dropped", () => {
    const skills = [sk("a", "beta"), sk("b", "Alpha"), sk("c", "gamma"), sk("d", "delta")];
    const links = [
      { agent_id: "x", skill_id: "c", order: 1 },
      { agent_id: "x", skill_id: "a", order: 0 },
      { agent_id: "x", skill_id: "gone", order: 2 },
    ];
    const rows = toAgentSkillRows(skills, links);
    expect(rows.linked.map((s) => s.id)).toEqual(["a", "c"]);
    expect(rows.unlinked.map((s) => s.name)).toEqual(["Alpha", "delta"]);
  });

  it("toAgentSkillRows: unlinked skills newest first, same date A→Z", () => {
    const skills = [
      sk("a", "old", "2026-10-01T10:00:00.000Z"),
      sk("b", "Newest", "2026-10-18T10:00:00.000Z"),
      sk("c", "beta", "2026-10-10T10:00:00.000Z"),
      sk("d", "Alpha", "2026-10-10T10:00:00.000Z"),
    ];
    expect(toAgentSkillRows(skills, []).unlinked.map((s) => s.name)).toEqual(["Newest", "Alpha", "beta", "old"]);
  });

  it("toggleLink appends on attach and removes on detach", () => {
    expect(toggleLink(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(toggleLink(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
    expect(toggleLink(["a", "b"], "a", true)).toEqual(["b", "a"]);
  });

  it("moveLink moves to the target's slot; no-op returns the same array", () => {
    const ids = ["a", "b", "c"];
    expect(moveLink(ids, "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveLink(ids, "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveLink(ids, "a", "a")).toBe(ids);
    expect(moveLink(ids, "a", "zzz")).toBe(ids);
  });

  it("matchesName is a case-insensitive substring match", () => {
    expect(matchesName(sk("a", "Edge Case Checklist"), "case")).toBe(true);
    expect(matchesName(sk("a", "Edge Case Checklist"), "mock")).toBe(false);
    expect(matchesName(sk("a", "x"), "  ")).toBe(true);
  });
});
