import { createHash } from 'node:crypto';
import type { Intent, IntentConfidence, IntentSource } from '@devdigest/shared';
import {
  DOC_EXTENSIONS,
  INTENT_FINGERPRINT_VERSION,
  MAX_LINKED_DOCS,
  MAX_SCOPE_ITEMS,
  MIN_BODY_CHARS_MEDIUM,
} from './constants.js';

/**
 * Pure rules of the intent layer: which links in a PR description we follow,
 * when a stored intent is still valid (fingerprint), and how much to trust it
 * (confidence). No I/O — the service feeds these with what the ports read.
 * Links are only ever reduced to a repo-relative PATH; nothing is fetched by URL.
 */

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

// ---- linked docs ----------------------------------------------------------

const GITHUB_BLOB_URL =
  /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:blob|tree)\/[^/\s)#?]+\/([^\s)#?"'<>\]]+)/gi;
const ANY_URL = /https?:\/\/[^\s)<>\]"']+/gi;
const RELATIVE_DOC = /(?<![\w/.:@-])((?:\.\/)?(?:[\w.@-]+\/)*[\w.@-]+\.(?:md|mdx|txt))(?![\w/-])/gi;

/** A clean repo-relative text-file path, or undefined (escapes, absolute, wrong extension). */
function cleanDocPath(raw: string): string | undefined {
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  path = path.replace(/^\.\//, '');
  if (/[^\w.@/ -]/.test(path)) return undefined;
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return undefined;
  if (path.split('/').some((seg) => seg === '..' || seg === '' || seg === '.')) return undefined;
  const lower = path.toLowerCase();
  if (!DOC_EXTENSIONS.some((ext) => lower.endsWith(ext))) return undefined;
  return path;
}

/**
 * Repo-relative doc paths referenced by a PR description: relative `*.md|mdx|txt`
 * paths and same-repo github.com blob/tree URLs (reduced to the path). Foreign
 * repos/hosts, `..` escapes and non-text extensions are rejected. Capped.
 */
export function extractDocRefs(body: string, repoFullName: string): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const path = cleanDocPath(raw);
    if (path && !out.includes(path)) out.push(path);
  };
  const repo = repoFullName.toLowerCase();
  for (const m of body.matchAll(GITHUB_BLOB_URL)) {
    if (`${m[1]}/${m[2]}`.toLowerCase() === repo) add(m[3]!);
  }
  const withoutUrls = body.replace(ANY_URL, ' ');
  for (const m of withoutUrls.matchAll(RELATIVE_DOC)) add(m[1]!);
  return out.slice(0, MAX_LINKED_DOCS);
}

// ---- linked issue ---------------------------------------------------------

/** The issue a PR description links: `closes #N`, a same-repo issue URL, or a bare `#N`. */
export function extractIssueRef(body: string, repoFullName: string): number | undefined {
  const closing = body.match(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)/i);
  if (closing) return Number(closing[1]);
  const url = new RegExp(
    `https?://github\\.com/${repoFullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/(\\d+)`,
    'i',
  );
  const fromUrl = body.match(url);
  if (fromUrl) return Number(fromUrl[1]);
  const bare = body.match(/(?<![\w&/])#(\d+)\b/);
  return bare ? Number(bare[1]) : undefined;
}

/** Content of a file ADDED in the PR (patch hunk `@@ -0,0 …`); undefined for modified files. */
export function contentFromAddedFilePatch(patch: string | null | undefined): string | undefined {
  if (!patch || !/^@@ -0,0 /.test(patch)) return undefined;
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

// ---- fingerprint, confidence, sources -------------------------------------

export interface FingerprintInput {
  provider: string;
  model: string;
  title: string;
  body: string | null;
  headSha: string;
  docs: { path: string; content: string | undefined }[];
}

/**
 * Identity of everything the intent was derived from. New commits change
 * `headSha` (covering commits, paths and stats); provider + model are in it so
 * switching the `review_intent` model makes the stored intent stale. The linked
 * issue text is deliberately not part of it.
 */
export function computeIntentFingerprint(input: FingerprintInput): string {
  const docs = input.docs
    .map((d) => [d.path, sha256(d.content ?? 'missing')] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return sha256(
    JSON.stringify([
      INTENT_FINGERPRINT_VERSION,
      input.provider,
      input.model,
      input.title,
      input.body ?? '',
      input.headSha,
      docs,
    ]),
  );
}

/** high: a doc or the issue was read; medium: only a real description; low: indirect data only. */
/** Out-of-scope filtering needs enough evidence: it is skipped at low confidence. */
export function shouldApplyScopeFilter(confidence: IntentConfidence): boolean {
  return confidence !== 'low';
}

export function deriveConfidence(input: {
  docsLoaded: number;
  issueLoaded: boolean;
  bodyChars: number;
}): IntentConfidence {
  if (input.docsLoaded > 0 || input.issueLoaded) return 'high';
  if (input.bodyChars >= MIN_BODY_CHARS_MEDIUM) return 'medium';
  return 'low';
}

export function buildIntentSources(input: {
  hasBody: boolean;
  issueNumber?: number;
  docPaths: string[];
  hasCommits: boolean;
  hasFiles: boolean;
}): IntentSource[] {
  const sources: IntentSource[] = [{ kind: 'title' }, { kind: 'branch' }];
  if (input.hasBody) sources.push({ kind: 'description' });
  if (input.issueNumber != null) sources.push({ kind: 'issue', ref: `#${input.issueNumber}` });
  for (const path of input.docPaths) sources.push({ kind: 'doc', ref: path });
  if (input.hasCommits) sources.push({ kind: 'commits' });
  if (input.hasFiles) sources.push({ kind: 'files' });
  return sources;
}

/**
 * Trim the model's answer, drop blanks and duplicates (case-insensitive, first
 * wins — the UI keys list items by their text), then clamp list sizes.
 */
export function normalizeIntent(intent: Intent): Intent {
  const clean = (items: string[]) => {
    const seen = new Set<string>();
    return items
      .map((s) => s.trim())
      .filter((s) => {
        const key = s.toLowerCase();
        if (!s || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_SCOPE_ITEMS);
  };
  return {
    intent: intent.intent.trim(),
    in_scope: clean(intent.in_scope),
    out_of_scope: clean(intent.out_of_scope),
  };
}
