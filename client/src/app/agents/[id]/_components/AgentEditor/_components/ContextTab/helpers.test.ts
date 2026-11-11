import { describe, it, expect } from "vitest";
import { countViaSkills } from "./helpers";

const entries = (...paths: string[]) => paths.map((path, order) => ({ path, order }));
const docs = new Map([
  ["server/AGENTS.md", { tokens: 300 }],
  ["server/docs/auth.md", { tokens: 800 }],
  ["server/docs/security.md", { tokens: 1200 }],
]);

describe("countViaSkills — AC-30", () => {
  it("no skills → K = 0, T = 0", () => {
    expect(countViaSkills(entries("server/AGENTS.md"), [], docs)).toEqual({ k: 0, tokens: 0 });
  });

  it("a path the agent already attaches is not counted (EC-4)", () => {
    const skills = [{ skill_id: "s1", paths: entries("server/AGENTS.md") }];
    expect(countViaSkills(entries("server/AGENTS.md"), skills, docs)).toEqual({ k: 0, tokens: 0 });
  });

  it("a path under two skills counts once, with its tokens once (EC-19)", () => {
    const skills = [
      { skill_id: "s1", paths: entries("server/docs/auth.md") },
      { skill_id: "s2", paths: entries("server/docs/auth.md") },
    ];
    expect(countViaSkills([], skills, docs)).toEqual({ k: 1, tokens: 800 });
  });

  it("a deleted file counts in K but adds nothing to T (EC-20)", () => {
    const skills = [{ skill_id: "s1", paths: entries("server/docs/security.md", "server/docs/old-auth.md") }];
    expect(countViaSkills([], skills, docs)).toEqual({ k: 2, tokens: 1200 });
  });
});
