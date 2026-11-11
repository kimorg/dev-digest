import type { ContextDocType, SpecRef } from '@devdigest/shared';

/** The stored attachments of one skill, in `skill_context_docs.order`. */
export interface SkillContextEntry {
  skillId: string;
  paths: { path: string; order: number }[];
}

/** One path of the merged list a review run reads. */
export interface MergedContextPath {
  path: string;
  source: 'agent' | 'skill';
  skillId: string | null;
}

/** The part of a repo the module needs. */
export interface ContextRepo {
  id: string;
  clonePath: string | null;
}

/** A document found by a scan (before it is stored). */
export interface ScannedDocument {
  path: string;
  type: ContextDocType;
  sizeBytes: number;
  tokens: number;
  tooLarge: boolean;
}

/** What a review run gets: the docs for the prompt and their trace refs. */
export interface ProjectContextRun {
  docs: { path: string; content: string }[];
  /** `null` when no doc reached the prompt. */
  refs: SpecRef[] | null;
}

/**
 * Facade other modules (reviews) use. Resolved as `container.projectContext`.
 * `log` receives the live-log lines (`Specs: …`).
 */
export interface ProjectContext {
  resolveForRun(
    workspaceId: string,
    repo: ContextRepo,
    agentId: string,
    log: (message: string) => void,
  ): Promise<ProjectContextRun>;
}
