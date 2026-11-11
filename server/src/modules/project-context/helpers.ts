import type { ContextDocument, ContextPathEntry, SkillContextPaths } from '@devdigest/shared';
import type { ContextDocumentRow } from '../../db/rows.js';
import type { SkillContextEntry } from './types.js';

/** Row + usage counts → API document. */
export function toContextDocumentDto(
  row: ContextDocumentRow,
  usedBy: { agents: number; skills: number },
): ContextDocument {
  const slash = row.path.lastIndexOf('/');
  return {
    path: row.path,
    name: slash === -1 ? row.path : row.path.slice(slash + 1),
    dir: slash === -1 ? '' : row.path.slice(0, slash),
    type: row.type,
    size_bytes: row.sizeBytes,
    tokens: row.tokens,
    too_large: row.tooLarge,
    used_by: usedBy,
  };
}

/** Stored attachment rows → `{ path, order }` entries, in `order`. */
export function toContextPathEntries(rows: { path: string; order: number }[]): ContextPathEntry[] {
  return [...rows]
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ path: r.path, order: r.order }));
}

export function toSkillContextPathsDto(entry: SkillContextEntry): SkillContextPaths {
  return { skill_id: entry.skillId, paths: toContextPathEntries(entry.paths) };
}
