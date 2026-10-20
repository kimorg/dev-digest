/**
 * Conventions extractor (L02) — tunables. Spec: server/specs/004-conventions.md
 */

/**
 * Root-level lint / type / format configs read as samples next to the ranked
 * files. Picked by code (no model): `getConventionSamples` filters configs out,
 * so they are added here explicitly. A missing file is simply skipped.
 */
export const CONFIG_SAMPLE_PATHS = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
] as const;

/** How many top-ranked source files `repoIntel.getConventionSamples` contributes. */
export const TOP_SAMPLE_FILES = 12;
/** Lines of each sample shown to the model (the rest is cut, with a marker). */
export const MAX_SAMPLE_LINES = 250;
/** Long (minified) lines are cut to this many chars in the prompt. */
export const MAX_SAMPLE_LINE_CHARS = 240;
/** Widest evidence range the model may cite. */
export const MAX_EVIDENCE_SPAN = 20;
/** The quoted code may sit this many lines outside the cited range (off-by-a-few line numbers). */
export const EVIDENCE_LINE_TOLERANCE = 2;
/** Quoted code shorter than this (normalised) can't prove anything — `}` matches everywhere. */
export const MIN_EVIDENCE_CODE_CHARS = 6;
/** Candidates kept per scan, highest confidence first. */
export const MAX_CANDIDATES = 15;
/** The model's answer is cut to this many before verification. */
export const MAX_MODEL_CANDIDATES = 30;
/** Per-call timeout for the analysis request. */
export const EXTRACTION_TIMEOUT_MS = 180_000;

/** Default name of the skill built from accepted conventions (requirement #42). */
export const DEFAULT_CONVENTION_SKILL_NAME = 'repo-conventions';
