import type { BlastRadius, Intent, PrBriefModelResult, PrBriefRecord } from '@devdigest/shared';
import { pickLatestPerAgent } from '@devdigest/shared';
import {
  MAX_BLAST_CHARS,
  MAX_CALLERS,
  MAX_CONTEXT_DOCS,
  MAX_DOCS_TOTAL_CHARS,
  MAX_DOC_CHARS,
  MAX_FOCUS,
  MAX_INPUT_CHARS,
  MAX_INTENT_CHARS,
  MAX_ISSUE_CHARS,
  MAX_BODY_CHARS,
  MAX_REASON_CHARS,
  MAX_RISKS,
  MAX_RISK_EXPLANATION_CHARS,
  MAX_RISK_TITLE_CHARS,
  MAX_STATS_CHARS,
  MAX_STAT_FILES,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
  SECTION_OVERHEAD_CHARS,
} from './constants.js';
import type { BriefInput, BriefSections, GroundedBrief } from './types.js';

/** The PR head moved since the brief was generated. */
export function isBriefStale(brief: Pick<PrBriefRecord, 'head_sha'>, headSha: string): boolean {
  return brief.head_sha !== headSha;
}

/**
 * Run ids of the latest review per agent, newest first. `heads` must be newest-first.
 * Rule: `pickLatestPerAgent` (`@devdigest/shared`). Reviews without a run contribute no id.
 */
export function latestRunIdsPerAgent(
  heads: readonly { agentId: string | null; runId: string | null }[],
): string[] {
  return pickLatestPerAgent(heads, (h) => h.agentId)
    .map((h) => h.runId)
    .filter((id): id is string => id != null);
}

/** Paths from the runs' `specs_read` (newest run first): each once, at most 5. */
export function pickContextDocPaths(specsReadNewestFirst: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  for (const paths of specsReadNewestFirst) {
    for (const p of paths) {
      if (out.includes(p)) continue;
      out.push(p);
      if (out.length >= MAX_CONTEXT_DOCS) return out;
    }
  }
  return out;
}

/**
 * The issue a PR description links: `closes #N`, a same-repo issue URL, or a bare `#N`.
 * Deliberate copy of `extractIssueRef` in `modules/intent/domain.ts` (~line 67): modules may
 * not import each other's internals. Keep the two in step.
 */
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

// ---- grounding ------------------------------------------------------------

/** Paths a brief may mention: the PR's files plus the files named in the Blast radius map. */
export function allowedBriefPaths(files: readonly string[], blast: BlastRadius): Set<string> {
  const allowed = new Set<string>(files);
  for (const s of blast.changed_symbols) allowed.add(s.file);
  for (const d of blast.downstream) for (const c of d.callers) allowed.add(c.file);
  for (const f of blast.caller_facts) allowed.add(f.file);
  return allowed;
}

/**
 * Split `path`, `path:N` or `path:N-M` into its parts; a missing or non-numeric line is `null`.
 * The range end (M) is not used. Keep in sync with the client copy (OverviewTab/helpers.ts).
 */
export function parseFileRef(ref: string): { path: string; line: number | null } {
  const trimmed = ref.trim();
  const m = /^(.*?)(?::(\d+)(?:-\d+)?)?$/.exec(trimmed);
  const path = m?.[1] || trimmed;
  const line = m?.[2] ? Number(m[2]) : null;
  return { path, line: line != null && line >= 1 ? line : null };
}

const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/**
 * Drop invented paths first (AC-26…AC-28), then keep the first 6 risks and 8 focus items
 * in model order and cut the long texts (AC-29).
 */
export function groundBriefOutput(out: PrBriefModelResult, allowed: ReadonlySet<string>): GroundedBrief {
  const keptRisks = out.risks
    .map((r) => ({ ...r, file_refs: r.file_refs.filter((ref) => allowed.has(parseFileRef(ref).path)) }))
    .filter((r) => r.file_refs.length > 0);
  const keptFocus = out.review_focus.filter((f) => allowed.has(f.file) && f.line >= 1);

  const risks = keptRisks.slice(0, MAX_RISKS).map((r) => ({
    ...r,
    title: cut(r.title, MAX_RISK_TITLE_CHARS),
    explanation: cut(r.explanation, MAX_RISK_EXPLANATION_CHARS),
  }));
  const reviewFocus = keptFocus
    .slice(0, MAX_FOCUS)
    .map((f) => ({ file: f.file, line: f.line, reason: cut(f.reason, MAX_REASON_CHARS) }));

  return {
    summary: cut(out.summary, MAX_SUMMARY_CHARS),
    risks,
    reviewFocus,
    droppedRisks: out.risks.length - risks.length,
    droppedFocus: out.review_focus.length - reviewFocus.length,
  };
}

// ---- prompt sections ------------------------------------------------------

/** `path +additions −deletions` per file (at most `maxFiles`, then "+N more files") and the totals. */
export function formatDiffStats(
  files: readonly { path: string; additions: number; deletions: number }[],
  maxFiles = MAX_STAT_FILES,
): string {
  const shown = files.slice(0, maxFiles);
  const lines = shown.map((f) => `${f.path} +${f.additions} −${f.deletions}`);
  if (files.length > shown.length) lines.push(`+${files.length - shown.length} more files`);
  const add = files.reduce((n, f) => n + f.additions, 0);
  const del = files.reduce((n, f) => n + f.deletions, 0);
  lines.push(`Total: ${files.length} files, +${add} −${del}`);
  return cut(lines.join('\n'), MAX_STATS_CHARS);
}

/** Blast radius summary, changed symbols, callers as `file:line` (at most `maxCallers`), endpoints, crons. */
export function formatBlastSection(blast: BlastRadius, maxCallers = MAX_CALLERS): string {
  const lines: string[] = [];
  if (blast.summary) lines.push(blast.summary);
  if (blast.changed_symbols.length > 0) {
    lines.push('Changed symbols:');
    for (const s of blast.changed_symbols) lines.push(`- ${s.name} (${s.kind}) ${s.file}`);
  }
  const callers = blast.downstream.flatMap((d) => d.callers.map((c) => `${c.file}:${c.line} ${c.name} → ${d.symbol}`));
  if (maxCallers > 0 && callers.length > 0) {
    lines.push('Callers:');
    for (const c of callers.slice(0, maxCallers)) lines.push(`- ${c}`);
  }
  const endpoints = [...new Set(blast.downstream.flatMap((d) => d.endpoints_affected))];
  const crons = [...new Set(blast.downstream.flatMap((d) => d.crons_affected))];
  if (endpoints.length > 0) lines.push(`Endpoints affected: ${endpoints.join(', ')}`);
  if (crons.length > 0) lines.push(`Crons affected: ${crons.join(', ')}`);
  return cut(lines.join('\n'), MAX_BLAST_CHARS);
}

export function formatIntentSection(intent: Intent): string {
  const lines = [intent.intent];
  if (intent.in_scope.length > 0) lines.push('In scope:', ...intent.in_scope.map((s) => `- ${s}`));
  if (intent.out_of_scope.length > 0) lines.push('Out of scope:', ...intent.out_of_scope.map((s) => `- ${s}`));
  return cut(lines.join('\n'), MAX_INTENT_CHARS);
}

interface Shrink {
  docChars: number;
  callers: number;
  files: number;
}

function buildSections(input: BriefInput, shrink: Shrink): BriefSections {
  const docs: BriefSections['docs'] = [];
  let remaining = MAX_DOCS_TOTAL_CHARS;
  for (const d of input.docs.slice(0, MAX_CONTEXT_DOCS)) {
    const content = cut(d.content, Math.min(shrink.docChars, remaining));
    if (content.length === 0) continue;
    remaining -= content.length;
    docs.push({ path: d.path, content });
  }
  const issueText = input.issue ? `${input.issue.title}\n\n${input.issue.body ?? ''}`.trim() : undefined;
  const description = input.description?.trim() ? cut(input.description, MAX_BODY_CHARS) : undefined;
  return {
    title: cut(input.title, MAX_TITLE_CHARS),
    ...(description ? { description } : {}),
    ...(issueText ? { issue: `#${input.issue!.number}: ${cut(issueText, MAX_ISSUE_CHARS)}` } : {}),
    ...(input.intent ? { intent: formatIntentSection(input.intent) } : {}),
    blast: formatBlastSection(input.blast, shrink.callers),
    stats: formatDiffStats(input.files, shrink.files),
    docs,
  };
}

function sectionsSize(s: BriefSections, systemChars: number): number {
  const texts = [s.title, s.description, s.issue, s.intent, s.blast, s.stats].filter((t): t is string => !!t);
  return (
    systemChars +
    texts.reduce((n, t) => n + t.length + SECTION_OVERHEAD_CHARS, 0) +
    s.docs.reduce((n, d) => n + d.path.length + d.content.length + SECTION_OVERHEAD_CHARS, 0)
  );
}

/**
 * Per-section limits first, then — only when the whole input would pass 40 000 chars —
 * shorten documents, then Blast radius callers, then the file list.
 */
export function fitInputBudget(input: BriefInput, systemChars: number): BriefSections {
  const shrink: Shrink = { docChars: MAX_DOC_CHARS, callers: MAX_CALLERS, files: MAX_STAT_FILES };
  let sections = buildSections(input, shrink);
  const over = () => sectionsSize(sections, systemChars) > MAX_INPUT_CHARS;
  for (const key of ['docChars', 'callers', 'files'] as const) {
    while (over() && shrink[key] > 0) {
      shrink[key] = Math.floor(shrink[key] / 2);
      sections = buildSections(input, shrink);
    }
  }
  return sections;
}
