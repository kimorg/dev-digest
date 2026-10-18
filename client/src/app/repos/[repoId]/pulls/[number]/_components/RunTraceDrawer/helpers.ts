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

/** Skills prompt text for display: each skill's body without its name/description wrapper. */
export function stripSkillHeaders(text: string): string {
  return text.replace(SKILL_OPEN_RE, "").replace(SKILL_CLOSE_RE, "");
}
