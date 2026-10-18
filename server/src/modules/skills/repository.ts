import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { SkillListItem, SkillVersion } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import type { NewSkill, SkillPatch, SkillStore } from './ports.js';

/**
 * Skills data access (L02). Owns `skills` and `skill_versions`; reads
 * `agent_skills` only to count links (the agents repository owns the link side).
 * Workspace-scoped throughout.
 */

export type { SkillRow, SkillVersionRow };

const agentCount = sql<number>`(
  select count(*)::int from ${t.agentSkills} where ${t.agentSkills.skillId} = ${t.skills.id}
)`;

export class SkillRepository implements SkillStore {
  constructor(private db: Db) {}

  async listSkills(workspaceId: string): Promise<SkillListItem[]> {
    const rows = await this.db
      .select({ skill: t.skills, agentCount })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(sql`lower(${t.skills.name})`));
    return rows.map((r) => toSkillDto(r.skill, r.agentCount));
  }

  async getSkill(workspaceId: string, id: string): Promise<SkillListItem | undefined> {
    const [row] = await this.db
      .select({ skill: t.skills, agentCount })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ? toSkillDto(row.skill, row.agentCount) : undefined;
  }

  /** True when another skill in the workspace already uses `name` (case-insensitive). */
  async isNameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          sql`lower(${t.skills.name}) = lower(${name})`,
          ...(exceptId ? [ne(t.skills.id, exceptId)] : []),
        ),
      );
    return row !== undefined;
  }

  /** Insert a skill AND its v1 body snapshot, atomically. */
  async insertSkill(values: NewSkill): Promise<SkillListItem> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...values, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: values.body });
      return toSkillDto(row!, 0);
    });
  }

  /**
   * Update a skill. A changed body bumps the version and snapshots it into
   * `skill_versions`; name/description/type/enabled changes don't. The row is
   * locked for the transaction so concurrent body edits get distinct versions.
   */
  async updateSkill(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return false;

      const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
      const version = bodyChanged ? existing.version + 1 : existing.version;

      await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { body: patch.body, version } : {}),
          updatedAt: new Date(),
        })
        .where(eq(t.skills.id, id));
      if (bodyChanged) {
        await tx.insert(t.skillVersions).values({ skillId: id, version, body: patch.body! });
      }
      return true;
    });
  }

  /** Delete a skill; its versions and agent links cascade. False if it wasn't there. */
  async deleteSkill(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** All body snapshots of a skill, newest first. */
  async listSkillVersions(skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersionDto);
  }

  async getSkillVersion(skillId: string, version: number): Promise<SkillVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row ? toSkillVersionDto(row) : undefined;
  }
}
