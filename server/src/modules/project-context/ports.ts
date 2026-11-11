import type { ContextDocument, ContextPathEntry } from '@devdigest/shared';
import type { ContextRepo, ScannedDocument, SkillContextEntry } from './types.js';

export type DocReadResult =
  | { status: 'ok'; content: string; sizeBytes: number }
  | { status: 'missing' }
  | { status: 'too_large'; sizeBytes: number }
  /** A symlink, or a path that resolves outside the clone. */
  | { status: 'unsafe' };

/** A markdown file found in the clone's pattern roots. */
export interface FoundDocFile {
  path: string;
  sizeBytes: number;
}

/** Reads markdown docs from a repo clone's working copy. Guarded: never leaves the clone. */
export interface ContextDocSource {
  /** True when `root` is an existing directory. */
  exists(root: string): Promise<boolean>;
  /** Regular `.md` files under the pattern roots, repo-relative, without symlinks. */
  list(root: string): Promise<FoundDocFile[]>;
  read(root: string, path: string): Promise<DocReadResult>;
}

/** What the service needs from storage, in contract types. Workspace-scoped. */
export interface ProjectContextStore {
  getRepo(workspaceId: string, repoId: string): Promise<ContextRepo | undefined>;
  getScan(repoId: string): Promise<{ scannedAt: Date; truncated: boolean } | undefined>;
  listDocumentsForRepo(workspaceId: string, repoId: string): Promise<ContextDocument[]>;
  /** One transaction: drop the repo's documents, insert the new ones, upsert the scan row. */
  replaceScan(
    repoId: string,
    docs: ScannedDocument[],
    scannedAt: Date,
    truncated: boolean,
  ): Promise<void>;
  /** `undefined` when the agent is not in the workspace. */
  getAgentPaths(workspaceId: string, agentId: string): Promise<ContextPathEntry[] | undefined>;
  setAgentPaths(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<ContextPathEntry[] | undefined>;
  /** `undefined` when the skill is not in the workspace. */
  getSkillPaths(workspaceId: string, skillId: string): Promise<ContextPathEntry[] | undefined>;
  setSkillPaths(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextPathEntry[] | undefined>;
  /**
   * Enabled skills linked to the agent, in `agent_skills.order`, each with its full
   * stored list (empty entries kept, nothing deduplicated).
   */
  listEnabledSkillContextForAgent(agentId: string): Promise<SkillContextEntry[]>;
}
