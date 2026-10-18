import type {
  CreateSkillRequest,
  SkillImportDraft,
  SkillImportRequest,
  SkillListItem,
  SkillVersion,
  UpdateSkillRequest,
} from '@devdigest/shared';
import { ConflictError } from '../../platform/errors.js';
import { isUniqueViolation } from './helpers.js';
import { decodeUpload, parseSkillUpload } from './import.js';
import type { SkillStore } from './ports.js';

/**
 * Skills service (L02). A skill is a reusable markdown instruction block that
 * agents link in an order; the run executor injects linked, enabled skills into
 * the prompt. Body edits are versioned in `skill_versions`.
 *
 * Methods return `undefined` when the skill isn't in this workspace (route → 404).
 */
export class SkillService {
  constructor(private repo: SkillStore) {}

  async list(workspaceId: string): Promise<SkillListItem[]> {
    return this.repo.listSkills(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<SkillListItem | undefined> {
    return this.repo.getSkill(workspaceId, id);
  }

  /** Create a skill (v1). An imported skill starts disabled — it is someone else's instructions. */
  async create(workspaceId: string, input: CreateSkillRequest): Promise<SkillListItem> {
    await this.assertNameFree(workspaceId, input.name);
    const source = input.source ?? 'manual';
    return this.withNameConflict(input.name, () =>
      this.repo.insertSkill({
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source,
        body: input.body,
        enabled: source !== 'imported_file',
      }),
    );
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillRequest,
  ): Promise<SkillListItem | undefined> {
    if (patch.name !== undefined) await this.assertNameFree(workspaceId, patch.name, id);
    const found = await this.withNameConflict(patch.name ?? '', () =>
      this.repo.updateSkill(workspaceId, id, patch),
    );
    return found ? this.get(workspaceId, id) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteSkill(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getSkill(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.listSkillVersions(id);
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getSkill(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.getSkillVersion(id, version);
  }

  /**
   * Restore an old body as a NEW version (history is never rewritten). Restoring
   * a body identical to the current one is a no-op. Undefined when the skill or
   * the version doesn't exist.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillListItem | undefined> {
    const snapshot = await this.getVersion(workspaceId, id, version);
    if (!snapshot) return undefined;
    return this.update(workspaceId, id, { body: snapshot.body });
  }

  /** Parse an uploaded .md / .zip into a draft for review. Persists nothing. */
  previewImport(req: SkillImportRequest): SkillImportDraft {
    return parseSkillUpload(req.filename, decodeUpload(req.content_base64));
  }

  private async assertNameFree(workspaceId: string, name: string, exceptId?: string) {
    if (await this.repo.isNameTaken(workspaceId, name, exceptId)) throw nameTaken(name);
  }

  /** The pre-check can race a concurrent insert; the unique index has the last word. */
  private async withNameConflict<T>(name: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (isUniqueViolation(err)) throw nameTaken(name);
      throw err;
    }
  }
}

function nameTaken(name: string): ConflictError {
  return new ConflictError(`A skill named "${name}" already exists`, 'skill_name_taken');
}
