import type { BlastIndexRead, BlastTarget } from './types.js';

/** Storage the blast read needs, in module types. The PR lookup is workspace-scoped. */
export interface BlastStore {
  /** The PR's repo and changed file paths, or `undefined` when the PR is not in the workspace. */
  getTargetForPull(workspaceId: string, prId: string): Promise<BlastTarget | undefined>;
}

/** The repo-intel facade, narrowed to the one call blast makes. */
export interface BlastIndex {
  getBlastRadius(repoId: string, files: string[]): Promise<BlastIndexRead>;
}
