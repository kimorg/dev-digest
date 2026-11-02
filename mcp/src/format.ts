/**
 * Pure formatters: API wire shapes -> compact tool results.
 * Text from PRs is untrusted: every string is clipped and stripped of control
 * characters (except \n and \t) before it reaches the model.
 */
import {
  AGENT_DESCRIPTION_MAX,
  CATEGORY_MAX,
  FILE_MAX,
  MAX_AGENTS,
  MAX_CONVENTIONS,
  MAX_FINDINGS,
  RATIONALE_MIN,
  RESPONSE_MAX,
  RULE_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
} from './constants.js';
import type {
  AgentSummary,
  ApiAgent,
  ApiConventions,
  ApiFinding,
  ApiReview,
  ApiRun,
  ApiSeverity,
  ConventionsResult,
  LatestResult,
  ReviewResult,
  RunningResult,
  SeverityCounts,
} from './types.js';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function stripControl(value: string): string {
  return value.replace(CONTROL_CHARS, '');
}

/** Strip control characters and cut to `max` characters (ellipsis counts). */
export function clip(value: string, max: number): string {
  const clean = stripControl(value);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Length of `value` once serialized into the JSON response (escapes counted, quotes not). */
function jsonLength(value: string): number {
  return JSON.stringify(value).length - 2;
}

/** Longest prefix of whole code points that, with `…` appended, takes at most `budget` JSON chars. */
function clipToJson(value: string, budget: number): string {
  if (jsonLength(value) <= budget) return value;
  if (budget < 1) return '';
  let used = 1; // the ellipsis
  let prefix = '';
  for (const ch of value) {
    const cost = jsonLength(ch);
    if (used + cost > budget) break;
    prefix += ch;
    used += cost;
  }
  return `${prefix}…`;
}

/**
 * Max-min fair split of `budget` among `wants`: smaller wants are met in full, and what is left is shared
 * evenly by the rest. Returns the grant per want; the sum never exceeds `budget`.
 */
function waterFill(wants: number[], budget: number): number[] {
  const grants = wants.map(() => 0);
  const ascending = wants.map((_, i) => i).sort((a, b) => (wants[a] ?? 0) - (wants[b] ?? 0));
  let left = budget;
  let remaining = wants.length;
  for (const i of ascending) {
    const given = Math.min(wants[i] ?? 0, Math.floor(left / remaining));
    grants[i] = given;
    left -= given;
    remaining--;
  }
  return grants;
}

const SEVERITY_ORDER: Record<ApiSeverity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
const SEVERITIES = Object.keys(SEVERITY_ORDER) as ApiSeverity[];

export interface RationaleInput {
  severity: ApiSeverity;
  rationale: string;
}

/**
 * Shares `budget` JSON chars among the rationales of findings given in priority order.
 * Pass 1 grants each up to RATIONALE_MIN, so no finding is left without a rationale. Pass 2 goes severity by
 * severity (CRITICAL → WARNING → SUGGESTION): a lower severity gets more than the minimum only once every
 * higher one is in full, and inside one severity the budget is split evenly (`waterFill`), so one long
 * rationale cannot take it all from its peers.
 */
export function fitRationales(items: RationaleInput[], budget: number): string[] {
  const need = items.map((it) => jsonLength(it.rationale));
  const grant = need.map(() => 0);
  let left = Math.max(0, budget);

  need.forEach((n, i) => {
    const given = Math.min(n, RATIONALE_MIN, left);
    grant[i] = given;
    left -= given;
  });

  for (const severity of SEVERITIES) {
    const tier = items.flatMap((it, i) => (it.severity === severity ? [i] : []));
    const extra = waterFill(
      tier.map((i) => (need[i] ?? 0) - (grant[i] ?? 0)),
      left,
    );
    tier.forEach((i, k) => {
      grant[i] = (grant[i] ?? 0) + (extra[k] ?? 0);
      left -= extra[k] ?? 0;
    });
  }
  return items.map((it, i) => clipToJson(it.rationale, grant[i] ?? 0));
}

// Notes are whole sentences: `toReviewResult` joins them (and the caller's note) with a space.
const TRUNCATION_NOTE = 'Lower-severity findings omitted — open the PR in the DevDigest UI.';
const RATIONALE_NOTE = 'Rationales shortened to fit the response (CRITICAL kept first) — full text in the DevDigest UI.';

export function toAgentSummary(agent: ApiAgent): AgentSummary {
  return {
    id: agent.id,
    name: agent.name,
    enabled: agent.enabled,
    model: agent.model,
    description: clip(agent.description ?? '', AGENT_DESCRIPTION_MAX),
  };
}

export function toAgentList(agents: ApiAgent[]): { agents: AgentSummary[] } {
  return { agents: agents.slice(0, MAX_AGENTS).map(toAgentSummary) };
}

function countBySeverity(findings: ApiFinding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

export interface ReviewContext {
  repo: string;
  pr: number;
  agent: string;
}

/**
 * A finished review: dismissed findings only counted, CRITICAL first, capped at MAX_FINDINGS.
 * Rationales share what RESPONSE_MAX leaves after everything else, by severity (see `fitRationales`).
 */
export function toReviewResult(review: ApiReview, ctx: ReviewContext, note?: string): ReviewResult {
  const live = review.findings.filter((f) => !f.dismissed_at);
  const dismissed = review.findings.length - live.length;
  // Array.prototype.sort is stable: findings keep the API order within a severity.
  const sorted = [...live].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const shown = sorted.slice(0, MAX_FINDINGS);
  const omitted = sorted.length - shown.length;

  const build = (rationales: string[], shortened: boolean): ReviewResult => {
    const notes = [
      note,
      omitted > 0 ? TRUNCATION_NOTE : undefined,
      shortened ? RATIONALE_NOTE : undefined,
    ].filter((n): n is string => Boolean(n));
    return {
      status: 'done',
      run_id: review.run_id,
      repo: ctx.repo,
      pr: ctx.pr,
      agent: ctx.agent,
      verdict: review.verdict,
      score: review.score,
      summary: clip(review.summary ?? '', SUMMARY_MAX),
      counts: countBySeverity(live),
      findings: shown.map((f, i) => ({
        severity: f.severity,
        category: clip(f.category, CATEGORY_MAX),
        title: clip(f.title, TITLE_MAX),
        file: clip(f.file, FILE_MAX),
        lines: `${f.start_line}-${f.end_line}`,
        rationale: rationales[i] ?? '',
      })),
      ...(omitted > 0 ? { more_findings: omitted } : {}),
      ...(dismissed > 0 ? { dismissed } : {}),
      ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    };
  };

  // Measure the response with empty rationales and the "shortened" note reserved: each rationale then adds
  // exactly its JSON length, and dropping the note when nothing was cut only makes the response shorter.
  const base = JSON.stringify(build([], true)).length;
  const full = shown.map((f) => stripControl(f.rationale));
  const fitted = fitRationales(
    shown.map((f, i) => ({ severity: f.severity, rationale: full[i] ?? '' })),
    RESPONSE_MAX - base,
  );
  return build(fitted, fitted.some((r, i) => r !== full[i]));
}

export function toRunningResult(runId: string, next: string): RunningResult {
  return { status: 'running', run_id: runId, next };
}

/** Accepted rules first, then the rest in API order; the evidence is `path:a-b`. */
export function toConventionsResult(repo: string, data: ApiConventions): ConventionsResult {
  const ordered = [
    ...data.candidates.filter((c) => c.status === 'accepted'),
    ...data.candidates.filter((c) => c.status !== 'accepted'),
  ];
  const shown = ordered.slice(0, MAX_CONVENTIONS);
  const omitted = ordered.length - shown.length;
  return {
    repo,
    scan: {
      status: data.scan?.status ?? 'none',
      created_at: data.scan?.created_at ?? '',
    },
    conventions: shown.map((c) => ({
      rule: clip(c.rule, RULE_MAX),
      status: c.status,
      evidence: `${clip(c.evidence_path, TITLE_MAX)}:${c.evidence_line_start}-${c.evidence_line_end}`,
    })),
    ...(omitted > 0 ? { more_conventions: omitted } : {}),
  };
}

/**
 * Latest outcome of one agent on one PR. `runs` and `reviews` are newest first
 * (as the API returns them). A failed run writes no review row, so a failure
 * after a good review only becomes a `note`.
 */
export function pickLatestResult(
  runs: ApiRun[],
  reviews: ApiReview[],
  agentId: string,
): LatestResult {
  const agentRuns = runs.filter((r) => r.agent_id === agentId);
  const latestRun = agentRuns[0];
  if (latestRun?.status === 'running') return { kind: 'running', runId: latestRun.run_id };

  const review = reviews.find((r) => r.agent_id === agentId && r.kind === 'review');
  const laterFailure =
    latestRun &&
    (latestRun.status === 'failed' || latestRun.status === 'cancelled') &&
    latestRun.run_id !== review?.run_id
      ? latestRun
      : undefined;

  if (review) {
    return {
      kind: 'review',
      review,
      ...(laterFailure
        ? {
            note: clip(
              `A later run ${laterFailure.run_id} ${laterFailure.status}${
                laterFailure.error ? `: ${laterFailure.error}` : ''
              }; this is the previous finished review.`,
              300,
            ),
          }
        : {}),
    };
  }
  return { kind: 'none', lastError: laterFailure?.error ?? null };
}
