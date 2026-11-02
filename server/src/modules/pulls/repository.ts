import { and, eq } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toPrMeta } from './helpers.js';
import type { PullStore } from './ports.js';

/** Read-only access to `repos` and `pull_requests` for the PR-by-number lookup. */
export class PullRepository implements PullStore {
  constructor(private db: Db) {}

  async getRepoFullName(workspaceId: string, repoId: string): Promise<string | undefined> {
    const [repo] = await this.db
      .select({ fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo?.fullName;
  }

  async getPullByNumber(workspaceId: string, repoId: string, number: number): Promise<PrMeta | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      );
    return row ? toPrMeta(row, Date.now()) : undefined;
  }
}
