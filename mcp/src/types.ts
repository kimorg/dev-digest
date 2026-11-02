/**
 * Domain types: wire schemas of the DevDigest HTTP API (only the fields this
 * package reads — Zod strips the rest) and the compact tool results.
 * No I/O, no `process.env`, no SDK. Schema and type share one name.
 */
import { z } from 'zod';

// ---- Wire schemas (responses of the DevDigest API) ----

export const ApiRepo = z.object({
  id: z.string(),
  full_name: z.string(),
});
export type ApiRepo = z.infer<typeof ApiRepo>;

/** `PrMeta` from `GET /repos/:id/pulls/:number`. */
export const ApiPull = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  head_sha: z.string(),
});
export type ApiPull = z.infer<typeof ApiPull>;

export const ApiAgent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  model: z.string(),
  enabled: z.boolean(),
});
export type ApiAgent = z.infer<typeof ApiAgent>;

export const ApiRun = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  status: z.string().nullable(), // running | done | failed | cancelled
  error: z.string().nullable(),
});
export type ApiRun = z.infer<typeof ApiRun>;

export const ApiSeverity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type ApiSeverity = z.infer<typeof ApiSeverity>;

export const ApiFinding = z.object({
  severity: ApiSeverity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  dismissed_at: z.string().nullish(),
});
export type ApiFinding = z.infer<typeof ApiFinding>;

export const ApiReview = z.object({
  id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  kind: z.string(), // review | summary
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  score: z.number().nullable(),
  findings: z.array(ApiFinding),
});
export type ApiReview = z.infer<typeof ApiReview>;

export const ApiConventionScan = z.object({
  status: z.string(), // done | failed
  error: z.string().nullable(),
  created_at: z.string(),
});
export type ApiConventionScan = z.infer<typeof ApiConventionScan>;

export const ApiConvention = z.object({
  rule: z.string(),
  status: z.string(), // pending | accepted | rejected
  evidence_path: z.string(),
  evidence_line_start: z.number().int(),
  evidence_line_end: z.number().int(),
});
export type ApiConvention = z.infer<typeof ApiConvention>;

export const ApiConventions = z.object({
  scan: ApiConventionScan.nullable(),
  candidates: z.array(ApiConvention),
});
export type ApiConventions = z.infer<typeof ApiConventions>;

/** `POST /pulls/:id/review` — only the started runs matter. */
export const ApiStartReview = z.object({
  runs: z.array(z.object({ run_id: z.string(), agent_id: z.string() })),
});
export type ApiStartReview = z.infer<typeof ApiStartReview>;

/** The API's error envelope: `{ error: { code, message } }`. */
export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

// ---- Tool results (compact, what the model sees) ----

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

export interface FindingResult {
  severity: ApiSeverity;
  category: string;
  title: string;
  file: string;
  lines: string;
  rationale: string;
}

export interface ReviewResult {
  status: 'done';
  run_id: string | null;
  repo: string;
  pr: number;
  agent: string;
  verdict: string | null;
  score: number | null;
  summary: string;
  counts: SeverityCounts;
  findings: FindingResult[];
  more_findings?: number;
  dismissed?: number;
  note?: string;
}

export interface RunningResult {
  status: 'running';
  run_id: string;
  next: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
  description: string;
}

export interface ConventionResult {
  rule: string;
  status: string;
  evidence: string;
}

export interface ConventionsResult {
  repo: string;
  scan: { status: string; created_at: string };
  conventions: ConventionResult[];
  more_conventions?: number;
}

/** What `get_findings` found for one agent on one PR. */
export type LatestResult =
  | { kind: 'running'; runId: string }
  | { kind: 'review'; review: ApiReview; note?: string }
  | { kind: 'none'; lastError: string | null };
