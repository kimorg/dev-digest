import type {
  ChatMessage,
  ConventionCandidate,
  ConventionScan,
  ConventionStatus,
} from '@devdigest/shared';
import type { VerifiedConvention } from './domain.js';
import type { ConventionExtraction } from './types.js';

/**
 * What the conventions service needs from the outside, in contract and module
 * types. wiring.ts plugs in the implementations. Workspace-scoped throughout.
 */

export interface ConventionRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface NewConventionScan {
  workspaceId: string;
  repoId: string;
  status: 'done' | 'failed';
  model: string | null;
  headSha: string | null;
  sampleFiles: string[];
  candidateCount: number;
  droppedCount: number;
  error: string | null;
}

export interface ConventionPatch {
  rule?: string;
  status?: ConventionStatus;
}

export interface ConventionStore {
  getRepo(workspaceId: string, repoId: string): Promise<ConventionRepo | undefined>;
  getLatestScan(repoId: string): Promise<ConventionScan | undefined>;
  /** Candidates of the repo in the given statuses, highest confidence first. */
  listConventions(repoId: string, statuses: ConventionStatus[]): Promise<ConventionCandidate[]>;
  /** One transaction: drop the repo's pending candidates, insert the scan and its candidates. */
  replacePendingWithScan(scan: NewConventionScan, candidates: VerifiedConvention[]): Promise<void>;
  /** Record a scan that failed; existing candidates are left alone. */
  insertFailedScan(scan: NewConventionScan): Promise<void>;
  /** Undefined when the candidate isn't in this workspace. */
  updateConvention(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionCandidate | undefined>;
  /** Set the status of the repo's non-rejected candidates among `ids`. */
  setStatus(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: 'pending' | 'accepted',
  ): Promise<void>;
}

/** The repo's clone: file reads (`undefined` = no such file) and its current commit. */
export interface RepoFiles {
  readFile(repo: { owner: string; name: string }, path: string): Promise<string | undefined>;
  /** HEAD commit of the clone; `undefined` when it can't be read. */
  headSha(repo: { owner: string; name: string }): Promise<string | undefined>;
}

/** The `conventions` feature model (Settings → Models). */
export interface ConventionModel {
  extract(
    workspaceId: string,
    messages: ChatMessage[],
  ): Promise<{ data: ConventionExtraction; model: string }>;
}

/** Ranked sample paths — `repoIntel.getConventionSamples`. */
export interface SampleSource {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}
