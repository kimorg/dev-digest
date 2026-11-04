import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrHistoryStore } from './ports.js';
import type { PullForHistory } from './types.js';

/** Read-only access to `pull_requests`, `repos` and `pr_files` for the history lookup. */
export class PrHistoryRepository implements PrHistoryStore {
  constructor(private db: Db) {}

  async getPullForHistory(workspaceId: string, prId: string): Promise<PullForHistory | undefined> {
    const [row] = await this.db
      .select({
        number: t.pullRequests.number,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const files = await this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return {
      repo: { owner: row.owner, name: row.name },
      number: row.number,
      base: row.base,
      headSha: row.headSha,
      files,
    };
  }
}
