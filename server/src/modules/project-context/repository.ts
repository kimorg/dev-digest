import { and, asc, count, eq } from 'drizzle-orm';
import type { ContextDocument, ContextPathEntry } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { toContextDocumentDto, toContextPathEntries } from './helpers.js';
import type { ProjectContextStore } from './ports.js';
import type { ContextRepo, ScannedDocument, SkillContextEntry } from './types.js';

/** Postgres store for project-context: documents, scans and the attachments. */
export class ProjectContextRepository implements ProjectContextStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<ContextRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.id, repoId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }

  async getScan(repoId: string): Promise<{ scannedAt: Date; truncated: boolean } | undefined> {
    const [row] = await this.db
      .select()
      .from(t.contextScans)
      .where(eq(t.contextScans.repoId, repoId));
    return row ? { scannedAt: row.scannedAt, truncated: row.truncated } : undefined;
  }

  async listDocumentsForRepo(workspaceId: string, repoId: string): Promise<ContextDocument[]> {
    const rows = await this.db
      .select()
      .from(t.contextDocuments)
      .where(eq(t.contextDocuments.repoId, repoId))
      .orderBy(asc(t.contextDocuments.path));
    if (rows.length === 0) return [];

    const agentCounts = await this.db
      .select({ path: t.agentContextDocs.path, n: count() })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agentContextDocs.path);
    const skillCounts = await this.db
      .select({ path: t.skillContextDocs.path, n: count() })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skillContextDocs.path);
    const agents = new Map(agentCounts.map((r) => [r.path, r.n]));
    const skills = new Map(skillCounts.map((r) => [r.path, r.n]));

    return rows.map((r) =>
      toContextDocumentDto(r, { agents: agents.get(r.path) ?? 0, skills: skills.get(r.path) ?? 0 }),
    );
  }

  async replaceScan(
    repoId: string,
    docs: ScannedDocument[],
    scannedAt: Date,
    truncated: boolean,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.contextDocuments).where(eq(t.contextDocuments.repoId, repoId));
      if (docs.length > 0) {
        await tx.insert(t.contextDocuments).values(
          docs.map((d) => ({
            repoId,
            path: d.path,
            type: d.type,
            sizeBytes: d.sizeBytes,
            tokens: d.tokens,
            tooLarge: d.tooLarge,
          })),
        );
      }
      await tx
        .insert(t.contextScans)
        .values({ repoId, scannedAt, truncated })
        .onConflictDoUpdate({ target: t.contextScans.repoId, set: { scannedAt, truncated } });
    });
  }

  async getAgentPaths(workspaceId: string, agentId: string): Promise<ContextPathEntry[] | undefined> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return undefined;
    const rows = await this.db
      .select({ path: t.agentContextDocs.path, order: t.agentContextDocs.order })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
    return toContextPathEntries(rows);
  }

  async setAgentPaths(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<ContextPathEntry[] | undefined> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return undefined;
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length > 0) {
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, order) => ({ agentId, path, order })));
      }
    });
    return paths.map((path, order) => ({ path, order }));
  }

  async getSkillPaths(workspaceId: string, skillId: string): Promise<ContextPathEntry[] | undefined> {
    if (!(await this.skillInWorkspace(workspaceId, skillId))) return undefined;
    const rows = await this.db
      .select({ path: t.skillContextDocs.path, order: t.skillContextDocs.order })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return toContextPathEntries(rows);
  }

  async setSkillPaths(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextPathEntry[] | undefined> {
    if (!(await this.skillInWorkspace(workspaceId, skillId))) return undefined;
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, order) => ({ skillId, path, order })));
      }
    });
    return paths.map((path, order) => ({ path, order }));
  }

  async listEnabledSkillContextForAgent(agentId: string): Promise<SkillContextEntry[]> {
    const rows = await this.db
      .select({
        skillId: t.skills.id,
        path: t.skillContextDocs.path,
        order: t.skillContextDocs.order,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .leftJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order), asc(t.skills.id), asc(t.skillContextDocs.order));

    const bySkill = new Map<string, SkillContextEntry>();
    for (const r of rows) {
      let entry = bySkill.get(r.skillId);
      if (!entry) {
        entry = { skillId: r.skillId, paths: [] };
        bySkill.set(r.skillId, entry);
      }
      if (r.path !== null && r.order !== null) entry.paths.push({ path: r.path, order: r.order });
    }
    return [...bySkill.values()];
  }

  private async agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.id, agentId), eq(t.agents.workspaceId, workspaceId)));
    return rows.length > 0;
  }

  private async skillInWorkspace(workspaceId: string, skillId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)));
    return rows.length > 0;
  }
}
