/** Limits on what goes into the intent prompt (chars unless noted). */
export const MAX_BODY_CHARS = 4000;
export const MAX_ISSUE_CHARS = 3000;
export const MAX_LINKED_DOCS = 3;
export const MAX_DOC_CHARS = 6000;
/** Commit subjects / changed paths listed in the prompt (counts). */
export const MAX_COMMITS = 30;
export const MAX_FILES = 100;
/** Clamp on the model's answer (counts). */
export const MAX_SCOPE_ITEMS = 6;
/** A description at least this long counts as real evidence ("medium" confidence). */
export const MIN_BODY_CHARS_MEDIUM = 80;

export const INTENT_TIMEOUT_MS = 60_000;

/** Bump to invalidate every stored intent (e.g. after a prompt rewrite). */
export const INTENT_FINGERPRINT_VERSION = 1;

/**
 * Linked files are read only when they look like prose or a spec — never `.env` or code.
 * `.yaml`/`.yml`/`.json` cover OpenAPI and JSON-schema specs linked from a description.
 */
export const DOC_EXTENSIONS = ['.md', '.mdx', '.txt', '.yaml', '.yml', '.json'] as const;
