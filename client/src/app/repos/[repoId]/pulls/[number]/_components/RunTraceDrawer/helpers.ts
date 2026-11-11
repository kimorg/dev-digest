import type { LogLine } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

// Wrapper lines server/src/modules/reviews/helpers.ts#renderSkillBlock adds
// around each skill body: the opening tag, the Description line and the blank
// line after it, and the closing tag.
const SKILL_OPEN_RE = /^<skill name="[^"]*" version="[^"]*">\nDescription: [^\n]*\n\n?/gm;
const SKILL_CLOSE_RE = /\n?^<\/skill>$/gm;

const SPEC_OPEN = '<untrusted source="';
const SPEC_OPEN_END = '">\n';
const SPEC_CLOSE = "\n</untrusted>";

/** Mirrors reviewer-core `wrapUntrusted`'s label sanitising. */
function specSourceLabel(path: string): string {
  return `spec:${path}`.replace(/[^\w./@#:-]/g, "_");
}

/**
 * The text of one project-context doc exactly as it sat in the prompt, taken from the
 * stored `specs` block (`<untrusted source="spec:<path>">…</untrusted>` blocks joined by
 * blank lines). Blocks are walked in order, so a doc that quotes another block's tag can't
 * be mistaken for it. Unknown path → null.
 */
export function extractSpecBlock(specs: string, path: string): string | null {
  const label = specSourceLabel(path);
  let pos = 0;
  for (;;) {
    const open = specs.indexOf(SPEC_OPEN, pos);
    if (open < 0) return null;
    const labelStart = open + SPEC_OPEN.length;
    const labelEnd = specs.indexOf(SPEC_OPEN_END, labelStart);
    if (labelEnd < 0) return null;
    const contentStart = labelEnd + SPEC_OPEN_END.length;
    const close = specs.indexOf(SPEC_CLOSE, contentStart);
    if (close < 0) return null;
    if (specs.slice(labelStart, labelEnd) === label) return specs.slice(contentStart, close);
    pos = close + SPEC_CLOSE.length;
  }
}

/** Skills prompt text for display: each skill's body without its name/description wrapper. */
export function stripSkillHeaders(text: string): string {
  return text.replace(SKILL_OPEN_RE, "").replace(SKILL_CLOSE_RE, "");
}
