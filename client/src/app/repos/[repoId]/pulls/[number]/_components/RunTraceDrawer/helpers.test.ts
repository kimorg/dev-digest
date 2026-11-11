import { describe, it, expect } from "vitest";
import { extractSpecBlock, stripSkillHeaders } from "./helpers";

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

// Same shape as reviewer-core wrapUntrusted.
const block = (label: string, content: string) => `<untrusted source="${label}">\n${content}\n</untrusted>`;

describe("extractSpecBlock — AC-51", () => {
  const specs = [
    block("spec:server/AGENTS.md", "# Server\nline two\n\nafter blank"),
    block("spec:docs/plans/a_b.md", "plan text"),
  ].join("\n\n");

  it("returns the exact inner text of the block for each path", () => {
    expect(extractSpecBlock(specs, "server/AGENTS.md")).toBe("# Server\nline two\n\nafter blank");
    // the label is sanitised like wrapUntrusted does (space → _)
    expect(extractSpecBlock(specs, "docs/plans/a b.md")).toBe("plan text");
  });

  it("an unknown path → null", () => {
    expect(extractSpecBlock(specs, "nope.md")).toBeNull();
  });

  it("a document that quotes another block's tag does not hijack it", () => {
    const tricky = [
      block("spec:a.md", 'quote: <untrusted source="spec:b.md">\nfake'),
      block("spec:b.md", "real b"),
    ].join("\n\n");
    expect(extractSpecBlock(tricky, "b.md")).toBe("real b");
  });
});
