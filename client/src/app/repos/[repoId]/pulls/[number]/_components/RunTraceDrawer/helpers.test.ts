import { describe, it, expect } from "vitest";
import { stripSkillHeaders } from "./helpers";

// Same shape as server renderSkillBlock, joined like reviewer-core assemblePrompt.
const skill = (name: string, body: string) =>
  [`<skill name="${name}" version="1">`, `Description: About ${name}.`, "", body, "</skill>"].join("\n");

describe("stripSkillHeaders", () => {
  it("drops each skill's tag and Description line, keeping the bodies apart", () => {
    const text = [skill("Over-Mocking", "# Over-Mocking\nbody one"), skill("Edge Cases", "# Edge Cases\nbody two")].join("\n\n");
    expect(stripSkillHeaders(text)).toBe("# Over-Mocking\nbody one\n\n# Edge Cases\nbody two");
  });

  it("leaves text without skill wrappers untouched", () => {
    expect(stripSkillHeaders("### skill\nDescription: kept")).toBe("### skill\nDescription: kept");
  });
});
