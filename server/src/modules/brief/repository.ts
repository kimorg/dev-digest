import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PrBriefRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toPrBriefRecord } from './helpers.js';
import type { BriefPull, BriefReviewRun, BriefStore } from './ports.js';

/**
 * Brief data access. Owns `pr_brief`; reads `pull_requests`, `repos`, `pr_files`, `reviews`
 * and `run_traces`. Workspace scoping is enforced on the PR lookup. `pr_files.patch` is
 * never selected.
 */
export class BriefRepository implements BriefStore {
  constructor(private db: Db) {}

  async getPullSources(workspaceId: string, prId: string): Promise<BriefPull | undefined> {
    const [pull] = await this.db
      .select({
        id: t.pullRequests.id,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pull) return undefined;

    const files = await this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));

    return {
      id: pull.id,
      repo: { owner: pull.owner, name: pull.name, fullName: pull.fullName, clonePath: pull.clonePath },
      title: pull.title,
      body: pull.body,
      headSha: pull.headSha,
      files,
    };
  }

  async getBrief(prId: string): Promise<PrBriefRecord | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row ? toPrBriefRecord(row.json) : undefined;
  }

  async listReviewRunsForPull(prId: string): Promise<BriefReviewRun[]> {
    return this.db
      .select({ agentId: t.reviews.agentId, runId: t.reviews.runId })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async listSpecsReadForRuns(runIds: string[]): Promise<{ runId: string; specsRead: string[] }[]> {
    if (runIds.length === 0) return [];
    const rows = await this.db
      .select({
        runId: t.runTraces.runId,
        specsRead: sql<unknown>`${t.runTraces.trace}->'specs_read'`,
      })
      .from(t.runTraces)
      .where(inArray(t.runTraces.runId, runIds));
    return rows.map((r) => ({
      runId: r.runId,
      specsRead: Array.isArray(r.specsRead)
        ? r.specsRead.filter((p): p is string => typeof p === 'string')
        : [],
    }));
  }

  async upsertBrief(prId: string, record: PrBriefRecord): Promise<PrBriefRecord> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: record })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: record } });
    return record;
  }
}
