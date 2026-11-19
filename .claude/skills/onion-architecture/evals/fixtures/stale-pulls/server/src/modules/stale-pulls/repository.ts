import { and, asc, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toStalePull } from './helpers.js';
import type { StalePullStore } from './ports.js';
import type { StalePull } from './types.js';

export class StalePullsRepository implements StalePullStore {
  constructor(private db: Db) {}

  async listOpenPullsUpdatedBefore(
    workspaceId: string,
    repoId: string,
    cutoff: Date,
    limit: number,
  ): Promise<StalePull[]> {
    const latestRun = this.db
      .select({
        prId: t.agentRuns.prId,
        findingCount: sql<number>`count(${t.findings.id})::int`.as('finding_count'),
      })
      .from(t.agentRuns)
      .leftJoin(t.findings, eq(t.findings.runId, t.agentRuns.id))
      .where(
        eq(
          t.agentRuns.createdAt,
          sql`(select max(r2.created_at) from agent_runs r2 where r2.pr_id = ${t.agentRuns.prId})`,
        ),
      )
      .groupBy(t.agentRuns.prId)
      .as('latest_run');

    const rows = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        updatedAt: t.pullRequests.updatedAt,
        findingCount: latestRun.findingCount,
      })
      .from(t.pullRequests)
      .leftJoin(latestRun, eq(latestRun.prId, t.pullRequests.id))
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.state, 'open'),
          lt(t.pullRequests.updatedAt, cutoff),
        ),
      )
      .orderBy(asc(t.pullRequests.updatedAt))
      .limit(limit);

    return rows.map((r) => toStalePull(r, r.findingCount ?? 0));
  }
}
