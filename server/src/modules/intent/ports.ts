import type {
  ChatMessage,
  FeatureModelChoice,
  Intent,
  IntentConfidence,
  IntentSource,
  PrIntentRecord,
} from '@devdigest/shared';

/**
 * What the intent service needs from the outside, in contract and module types.
 * wiring.ts plugs in the implementations. Workspace-scoped where a PR is read.
 */

export interface IntentPull {
  id: string;
  repo: { owner: string; name: string; fullName: string };
  title: string;
  branch: string;
  headSha: string;
  body: string | null;
  files: { path: string; additions: number; deletions: number; patch: string | null }[];
  commits: { message: string }[];
}

/** A stored intent plus the fingerprint it was derived under. */
export interface StoredPrIntent {
  record: PrIntentRecord;
  fingerprint: string;
}

export interface NewPrIntent {
  intent: Intent;
  confidence: IntentConfidence;
  sources: IntentSource[];
  provider: string;
  model: string;
  fingerprint: string;
}

export interface IntentStore {
  /** Undefined when the PR isn't in this workspace. */
  getPullSources(workspaceId: string, prId: string): Promise<IntentPull | undefined>;
  getIntent(prId: string): Promise<StoredPrIntent | undefined>;
  /** Insert or replace the PR's intent; returns the stored record. */
  upsertIntent(prId: string, rec: NewPrIntent): Promise<PrIntentRecord>;
}

export interface RepoFiles {
  /** Undefined when the file is missing or not a readable working-tree file. */
  readFile(repo: { owner: string; name: string }, path: string): Promise<string | undefined>;
}

export interface IssueSource {
  /** Undefined when the issue can't be fetched (no token, offline, not found). */
  getIssue(
    repo: { owner: string; name: string },
    n: number,
  ): Promise<{ number: number; title: string; body: string | null } | undefined>;
}

export interface IntentModel {
  resolve(workspaceId: string): Promise<FeatureModelChoice>;
  derive(
    choice: FeatureModelChoice,
    messages: ChatMessage[],
  ): Promise<{
    data: Intent;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number | null;
  }>;
}
