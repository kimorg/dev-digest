import type { SkillListItem, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';

/**
 * What the skills service needs from storage, in contract types. Implemented
 * by SkillRepository; wiring.ts plugs it in. Workspace-scoped throughout.
 */

export interface NewSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  /** Files the skill was derived from (conventions extractor); null for hand-written skills. */
  evidenceFiles: string[] | null;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillStore {
  listSkills(workspaceId: string): Promise<SkillListItem[]>;
  getSkill(workspaceId: string, id: string): Promise<SkillListItem | undefined>;
  /** True when another skill in the workspace already uses `name` (case-insensitive). */
  isNameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean>;
  /** Insert a skill and its v1 body snapshot. */
  insertSkill(values: NewSkill): Promise<SkillListItem>;
  /** Apply a patch (a changed body bumps the version). False if the skill isn't there. */
  updateSkill(workspaceId: string, id: string, patch: SkillPatch): Promise<boolean>;
  /** False if the skill wasn't there. */
  deleteSkill(workspaceId: string, id: string): Promise<boolean>;
  /** Body snapshots, newest first. */
  listSkillVersions(skillId: string): Promise<SkillVersion[]>;
  getSkillVersion(skillId: string, version: number): Promise<SkillVersion | undefined>;
}
