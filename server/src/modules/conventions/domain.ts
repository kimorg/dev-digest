import {
  SKILL_BODY_MAX,
  type ConventionCandidate,
  type ConventionSkillDraft,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import {
  DEFAULT_CONVENTION_SKILL_NAME,
  EVIDENCE_LINE_TOLERANCE,
  MAX_EVIDENCE_SPAN,
  MAX_SAMPLE_LINE_CHARS,
  MAX_SAMPLE_LINES,
  MIN_EVIDENCE_CODE_CHARS,
} from './constants.js';

/**
 * Conventions extractor — pure rules: sample rendering, the evidence gate, rule
 * dedupe and the skill draft. No I/O.
 */

export class NoConventionSamplesError extends AppError {
  constructor() {
    super(
      'conventions_no_samples',
      'No sample files to analyse — clone and index the repo first.',
      422,
    );
  }
}

export class NoAcceptedConventionsError extends AppError {
  constructor() {
    super('no_accepted_conventions', 'Accept at least one convention first.', 422);
  }
}

/** A candidate whose evidence passed the gate, ready to store. */
export interface VerifiedConvention {
  rule: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number;
}

export type EvidenceFailure =
  | 'file_missing'
  | 'bad_range'
  | 'line_out_of_range'
  | 'span_too_long'
  | 'code_too_short'
  | 'code_not_found';

export type EvidenceCheck =
  | { ok: true; lineStart: number; lineEnd: number; snippet: string }
  | { ok: false; reason: EvidenceFailure };

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * A repo-relative path the model may cite, or `undefined` when it could escape
 * the clone (absolute, `..`, backslashes, NUL) or is malformed. A leading `./`
 * is dropped.
 */
export function normalizeEvidencePath(raw: string): string | undefined {
  const p = raw.trim().replace(/^(\.\/)+/, '');
  if (!p || p.length > 500) return undefined;
  if (p.includes('\0') || p.includes('\\')) return undefined;
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return undefined;
  const segments = p.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return undefined;
  return p;
}

/** A sample as the model sees it: `  12 | code`, capped in lines and line width. */
export function renderSample(path: string, text: string): string {
  const lines = splitLines(text);
  const width = String(Math.min(lines.length, MAX_SAMPLE_LINES)).length;
  const shown = lines.slice(0, MAX_SAMPLE_LINES).map((line, i) => {
    const cut = line.length > MAX_SAMPLE_LINE_CHARS ? `${line.slice(0, MAX_SAMPLE_LINE_CHARS)}…` : line;
    return `${String(i + 1).padStart(width)} | ${cut}`;
  });
  const rest = lines.length - MAX_SAMPLE_LINES;
  if (rest > 0) shown.push(`… (${rest} more lines not shown)`);
  return `File: ${path}\n${shown.join('\n')}`;
}

/** End line (1-based) when `quote` matches consecutive non-blank lines from `start`. */
function matchQuoteAt(lines: string[], start: number, quote: string[]): number | undefined {
  let at = start;
  for (const q of quote) {
    while (at <= lines.length && normalize(lines[at - 1]!) === '') at++;
    if (at > lines.length || !normalize(lines[at - 1]!).includes(q)) return undefined;
    at++;
  }
  return at - 1;
}

/**
 * The evidence gate. A candidate survives only if its file exists, the cited
 * lines exist, and the quoted code really is there — within the cited range,
 * give or take `EVIDENCE_LINE_TOLERANCE` lines (the range then widens to cover
 * the match). The stored snippet is the file's real text, never the model's quote.
 */
export function verifyEvidence(
  evidence: { line_start: number; line_end: number; code: string },
  fileText: string | undefined,
): EvidenceCheck {
  if (fileText === undefined) return { ok: false, reason: 'file_missing' };
  const lines = splitLines(fileText);
  const { line_start: start, line_end: end } = evidence;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return { ok: false, reason: 'bad_range' };
  }
  if (end > lines.length) return { ok: false, reason: 'line_out_of_range' };
  if (end - start + 1 > MAX_EVIDENCE_SPAN) return { ok: false, reason: 'span_too_long' };

  const quote = splitLines(evidence.code).map(normalize).filter(Boolean);
  if (quote.join('').length < MIN_EVIDENCE_CODE_CHARS) return { ok: false, reason: 'code_too_short' };

  const lo = Math.max(1, start - EVIDENCE_LINE_TOLERANCE);
  const hi = Math.min(lines.length, end + EVIDENCE_LINE_TOLERANCE);
  for (let at = lo; at <= hi; at++) {
    const matchEnd = matchQuoteAt(lines, at, quote);
    if (matchEnd === undefined) continue;
    let lineStart = Math.min(start, at);
    let lineEnd = Math.max(end, matchEnd);
    // Blank lines at the edges of the range add nothing to the evidence.
    while (lineStart < lineEnd && normalize(lines[lineStart - 1]!) === '') lineStart++;
    while (lineEnd > lineStart && normalize(lines[lineEnd - 1]!) === '') lineEnd--;
    return {
      ok: true,
      lineStart,
      lineEnd,
      snippet: lines.slice(lineStart - 1, lineEnd).join('\n'),
    };
  }
  return { ok: false, reason: 'code_not_found' };
}

/** Model confidence as 0..1 — a 0..100 answer is read as a percentage. */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const v = value > 1 && value <= 100 ? value / 100 : value;
  return Math.min(1, Math.max(0, v));
}

/** Comparison key for "the same rule": case, spacing and trailing punctuation ignored. */
export function normalizeRule(rule: string): string {
  return normalize(rule).toLowerCase().replace(/[.!;:,]+$/, '');
}

/**
 * Highest-confidence first, one candidate per rule, and none whose rule the user
 * already accepted or rejected — so a rejected rule never comes back (#48).
 */
export function dedupeCandidates(
  candidates: VerifiedConvention[],
  reviewedRules: string[],
): VerifiedConvention[] {
  const seen = new Set(reviewedRules.map(normalizeRule));
  const out: VerifiedConvention[] = [];
  for (const c of [...candidates].sort((a, b) => b.confidence - a.confidence)) {
    const key = normalizeRule(c.rule);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** kebab-case heading id for a rule ("Always use async/await" → "always-use-async-await"). */
export function ruleSlug(rule: string): string {
  const slug = rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'convention';
}

const FENCE_LANG: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  yml: 'yaml',
  yaml: 'yaml',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
};

function fenced(path: string, code: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const longestRun = Math.max(2, ...(code.match(/`+/g) ?? []).map((r) => r.length));
  const fence = '`'.repeat(longestRun + 1);
  return `${fence}${FENCE_LANG[ext] ?? ''}\n${code}\n${fence}`;
}

function renderBody(repoName: string, accepted: ConventionCandidate[], withSnippets: boolean): string {
  const used = new Map<string, number>();
  const sections = accepted.map((c) => {
    const base = ruleSlug(c.rule);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const heading = n === 1 ? base : `${base}-${n}`;
    const lines =
      c.evidence_line_start === c.evidence_line_end
        ? `${c.evidence_line_start}`
        : `${c.evidence_line_start}-${c.evidence_line_end}`;
    const where = `${c.evidence_path}:${lines}`;
    const evidence = withSnippets
      ? `Detected in \`${where}\`:\n\n${fenced(c.evidence_path, c.evidence_snippet)}`
      : `Detected in \`${where}\`.`;
    return `## ${heading}\n${c.rule}\n\n${evidence}`;
  });
  return [
    `# ${DEFAULT_CONVENTION_SKILL_NAME}`,
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join('\n\n');
}

/**
 * Accepted candidates merged into one `convention` skill draft (#42). Evidence
 * snippets are dropped when they'd push the body over the skill size limit.
 */
export function buildSkillDraft(
  repoName: string,
  accepted: ConventionCandidate[],
): ConventionSkillDraft {
  let body = renderBody(repoName, accepted, true);
  if (body.length > SKILL_BODY_MAX) body = renderBody(repoName, accepted, false);
  const n = accepted.length;
  return {
    name: DEFAULT_CONVENTION_SKILL_NAME,
    description: `${n} house convention${n === 1 ? '' : 's'} extracted from ${repoName}`,
    type: 'convention',
    body,
    convention_count: n,
    evidence_files: [...new Set(accepted.map((c) => c.evidence_path))],
  };
}

/** A short, single-line message for a failed scan record. */
export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\s+/g, ' ').trim().slice(0, 500) || 'Unknown error';
}
