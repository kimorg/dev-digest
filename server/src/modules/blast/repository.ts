import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastStore } from './ports.js';
import type { BlastTarget } from './types.js';

/** Read-only access to `pull_requests` and `pr_files` for the blast read. */
export class BlastRepository implements BlastStore {
  constructor(private db: Db) {}

  async getTargetForPull(workspaceId: string, prId: string): Promise<BlastTarget | undefined> {
    const [pull] = await this.db
      .select({ repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;
    const files = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return { repoId: pull.repoId, files: files.map((f) => f.path) };
  }
}
