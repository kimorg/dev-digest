import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrIntentRecord } from '@devdigest/shared';
import { DOC_EXTENSIONS, MAX_COMMITS, MAX_FILES } from './constants.js';
import { toPrIntentRecord } from './helpers.js';
import type { IntentPull, IntentStore, NewPrIntent, StoredPrIntent } from './ports.js';

// Patch text is only needed for text docs added by the PR (their content is the + lines).
const DOC_PATH_PATTERN = `\\.(${DOC_EXTENSIONS.map((e) => e.slice(1)).join('|')})$`;

/**
 * Intent data access. Owns `pr_intent`; reads `pull_requests`, `repos`, `pr_files`
 * and `pr_commits` to gather what the intent is derived from. Workspace scoping
 * is enforced on the PR lookup.
 */
export class IntentRepository implements IntentStore {
  constructor(private db: Db) {}

  async getPullSources(workspaceId: string, prId: string): Promise<IntentPull | undefined> {
    const [pull] = await this.db
      .select({
        id: t.pullRequests.id,
        title: t.pullRequests.title,
        branch: t.pullRequests.branch,
        headSha: t.pullRequests.headSha,
        body: t.pullRequests.body,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
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
        patch: sql<string | null>`case when ${t.prFiles.path} ~* ${DOC_PATH_PATTERN} then ${t.prFiles.patch} else null end`,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path))
      .limit(MAX_FILES);

    const commits = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .orderBy(desc(t.prCommits.committedAt))
      .limit(MAX_COMMITS);

    return {
      id: pull.id,
      repo: { owner: pull.owner, name: pull.name, fullName: pull.fullName },
      title: pull.title,
      branch: pull.branch,
      headSha: pull.headSha,
      body: pull.body,
      files,
      commits,
    };
  }

  async getIntent(prId: string): Promise<StoredPrIntent | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row ? { record: toPrIntentRecord(row), fingerprint: row.fingerprint } : undefined;
  }

  async upsertIntent(prId: string, rec: NewPrIntent): Promise<PrIntentRecord> {
    const values = {
      intent: rec.intent.intent,
      inScope: rec.intent.in_scope,
      outOfScope: rec.intent.out_of_scope,
      confidence: rec.confidence,
      sources: rec.sources,
      fingerprint: rec.fingerprint,
      provider: rec.provider,
      model: rec.model,
      generatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values({ prId, ...values })
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return toPrIntentRecord(row!);
  }
}
