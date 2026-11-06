/** Package folders whose markdown docs can be listed (spec "Patterns and types"). */
export const CONTEXT_PACKAGES = ['client', 'server', 'reviewer-core', 'mcp', 'e2e'] as const;

/** A file larger than this is listed as `too_large` and never read (AC-14). */
export const MAX_CONTEXT_DOC_BYTES = 400 * 1024;

/** A scan keeps the first N documents by path and sets `truncated` (EC-8). */
export const MAX_CONTEXT_DOCS = 1000;

/** Attachments per agent or skill (AC-36). */
export const MAX_CONTEXT_PATHS = 100;

/** Longest accepted document path (AC-16). */
export const MAX_CONTEXT_PATH_LEN = 512;

/** `POST /repos/:id/context/rescan`: 10 requests per minute. */
export const RESCAN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
