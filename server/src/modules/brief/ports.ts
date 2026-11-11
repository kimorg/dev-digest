import type { BlastRadius, ChatMessage, FeatureModelChoice, Intent, PrBriefModelResult, PrBriefRecord } from '@devdigest/shared';

/**
 * What the brief service needs from the outside, in contract and module types.
 * wiring.ts plugs in the implementations. Workspace-scoped where a PR is read.
 */

export interface BriefPull {
  id: string;
  repo: { owner: string; name: string; fullName: string; clonePath: string | null };
  title: string;
  body: string | null;
  headSha: string;
  /** Paths and counters only — never the patch text. */
  files: { path: string; additions: number; deletions: number }[];
}

/** One review of the PR, newest first when listed. */
export interface BriefReviewRun {
  agentId: string | null;
  runId: string | null;
}

export interface BriefStore {
  /** Undefined when the PR isn't in this workspace. */
  getPullSources(workspaceId: string, prId: string): Promise<BriefPull | undefined>;
  /** Undefined when there is no brief, or the stored JSON is corrupt / of an old shape. */
  getBrief(prId: string): Promise<PrBriefRecord | undefined>;
  /** `kind='review'` reviews of the PR, newest first. */
  listReviewRunsForPull(prId: string): Promise<BriefReviewRun[]>;
  /** `specs_read` paths per run; a run with no trace or no `specs_read` has `[]`. */
  listSpecsReadForRuns(runIds: string[]): Promise<{ runId: string; specsRead: string[] }[]>;
  /** Insert or replace the PR's brief. */
  upsertBrief(prId: string, record: PrBriefRecord): Promise<PrBriefRecord>;
}

export interface BriefBlast {
  get(workspaceId: string, prId: string): Promise<BlastRadius>;
}

export interface BriefIntent {
  /** The stored intent; null when none is stored. Never generates. */
  get(workspaceId: string, prId: string): Promise<Intent | null>;
}

export interface BriefIssues {
  /** Undefined when the issue can't be fetched (no token, offline, not found). */
  getIssue(
    repo: { owner: string; name: string },
    n: number,
  ): Promise<{ number: number; title: string; body: string | null } | undefined>;
}

export interface BriefDocs {
  /** Document text from the repo clone; undefined when it is missing or unreadable. */
  read(clonePath: string, path: string): Promise<string | undefined>;
}

export interface BriefModel {
  resolve(workspaceId: string): Promise<FeatureModelChoice>;
  generate(
    choice: FeatureModelChoice,
    messages: ChatMessage[],
  ): Promise<{
    data: PrBriefModelResult;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number | null;
  }>;
}

export interface BriefLog {
  info(obj: object, msg: string): void;
}
