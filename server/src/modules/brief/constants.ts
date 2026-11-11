/** Input budget (chars unless noted) — SPEC-006 NFR-1. */
export const MAX_TITLE_CHARS = 300;
export const MAX_BODY_CHARS = 4000;
export const MAX_ISSUE_CHARS = 3000;
export const MAX_INTENT_CHARS = 2000;
export const MAX_BLAST_CHARS = 6000;
export const MAX_STATS_CHARS = 8000;
export const MAX_DOC_CHARS = 4000;
export const MAX_DOCS_TOTAL_CHARS = 12_000;
/** The whole model input (system + user messages). */
export const MAX_INPUT_CHARS = 40_000;
/** Rough size of the wrapper + heading around one prompt section. */
export const SECTION_OVERHEAD_CHARS = 100;

/** Counts. */
export const MAX_CONTEXT_DOCS = 5;
export const MAX_CALLERS = 50;
export const MAX_STAT_FILES = 100;

/** Output limits — SPEC-006 NFR-2. */
export const MAX_RISKS = 6;
export const MAX_FOCUS = 8;
export const MAX_SUMMARY_CHARS = 600;
export const MAX_RISK_TITLE_CHARS = 100;
export const MAX_RISK_EXPLANATION_CHARS = 800;
export const MAX_REASON_CHARS = 200;

export const BRIEF_TIMEOUT_MS = 60_000;
