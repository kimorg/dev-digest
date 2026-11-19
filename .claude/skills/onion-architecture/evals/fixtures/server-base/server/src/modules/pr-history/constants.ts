/** Prior-PR lookup limits: they bound the GitHub request count (worst case 5 + 10 = 15). */
export const MAX_HISTORY_FILES = 5;
export const MAX_HISTORY_COMMITS_PER_FILE = 5;
export const MAX_HISTORY_SHAS = 10;
/** Commit → PR lookups run this many at a time; the loop stops once enough PRs are found. */
export const HISTORY_SHA_BATCH = 5;
export const MAX_HISTORY_PRS = 5;
export const HISTORY_CACHE_TTL_MS = 600_000;
export const HISTORY_CACHE_MAX = 100;
