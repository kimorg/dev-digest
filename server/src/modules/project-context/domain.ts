import type { ContextDocType } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { CONTEXT_PACKAGES, MAX_CONTEXT_PATH_LEN } from './constants.js';
import type { MergedContextPath, SkillContextEntry } from './types.js';

export class InvalidContextPathError extends AppError {
  constructor(path: string) {
    super('invalid_context_path', `Invalid context document path: ${path}`, 422, { path });
  }
}

export class DuplicateContextPathError extends AppError {
  constructor(path: string) {
    super('duplicate_context_path', `Duplicate context document path: ${path}`, 422, { path });
  }
}

export class TooManyContextDocsError extends AppError {
  constructor(max: number) {
    super('too_many_context_docs', `At most ${max} context documents can be attached`, 422, { max });
  }
}

export class ContextDocNotFoundError extends AppError {
  constructor(path: string) {
    super('context_doc_not_found', `Context document not found: ${path}`, 404, { path });
  }
}

export class ContextDocTooLargeError extends AppError {
  constructor(path: string) {
    super('context_doc_too_large', `Context document is too large: ${path}`, 422, { path });
  }
}

export class RepoNotClonedError extends AppError {
  constructor() {
    super('repo_not_cloned', 'Repository is not cloned yet', 409);
  }
}

const isPackage = (s: string | undefined): boolean =>
  s !== undefined && (CONTEXT_PACKAGES as readonly string[]).includes(s);

/**
 * Type of a repo-relative markdown path by the "Patterns and types" table
 * (priority order), or null when it is no context document. `<pkg>/CLAUDE.md`
 * is excluded.
 */
export function classifyContextPath(path: string): ContextDocType | null {
  if (!path.endsWith('.md')) return null;
  const parts = path.split('/');
  const [first, second] = parts;
  const pkg = isPackage(first);

  if (pkg && parts.length === 2) {
    if (second === 'CLAUDE.md') return null;
    if (second === 'INSIGHTS.md') return 'insights';
  }
  if (pkg && second === 'docs' && parts.length >= 3) return 'docs';
  if (pkg && second === 'specs' && parts.length >= 3) return 'specs';
  if (first === 'specs' && parts.length >= 2) return 'specs';
  if (first === 'docs' && second === 'plans' && parts.length >= 3) return 'plans';
  if (pkg && parts.length === 2) return 'readme';
  return null;
}

/** AC-16: relative, no `..` / `.git` segment, at most 512 chars, matches a pattern, not CLAUDE.md. */
export function validateContextPath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_CONTEXT_PATH_LEN) {
    return false;
  }
  if (path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return false;
  const bad = path
    .split('/')
    .some((s) => s === '' || s === '.' || s === '..' || s.toLowerCase() === '.git');
  if (bad) return false;
  return classifyContextPath(path) !== null;
}

/**
 * The review run's list: the agent's paths first, then each skill's in the
 * order given. A path keeps its first position (AC-38).
 */
export function mergeContextPaths(
  agentPaths: { path: string; order: number }[],
  skillEntries: SkillContextEntry[],
): MergedContextPath[] {
  const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
  const seen = new Set<string>();
  const out: MergedContextPath[] = [];
  const add = (path: string, source: 'agent' | 'skill', skillId: string | null) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, source, skillId });
  };
  for (const p of [...agentPaths].sort(byOrder)) add(p.path, 'agent', null);
  for (const s of skillEntries) {
    for (const p of [...s.paths].sort(byOrder)) add(p.path, 'skill', s.skillId);
  }
  return out;
}
