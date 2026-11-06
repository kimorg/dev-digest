import type { ContextDocType, ContextDocument } from "@devdigest/shared";

/** Above this many attached tokens the picker warns (AC-31). */
export const LARGE_CONTEXT_TOKENS = 20_000;

export interface ContextRow {
  path: string;
  name: string;
  dir: string;
  /** Null for an attached path that is not in the active repository. */
  type: ContextDocType | null;
  tokens: number;
  isTooLarge: boolean;
  isMissing: boolean;
}

export interface ContextRows {
  /** Attached paths in their saved order (missing ones included). */
  attached: ContextRow[];
  /** Every other document, sorted by path. */
  unattached: ContextRow[];
}

function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { name: path, dir: "" } : { name: path.slice(i + 1), dir: path.slice(0, i) };
}

function fromDocument(d: ContextDocument): ContextRow {
  return {
    path: d.path,
    name: d.name,
    dir: d.dir,
    type: d.type,
    tokens: d.tokens,
    isTooLarge: d.too_large,
    isMissing: false,
  };
}

/** Attached docs first (saved order; unknown paths become "missing" rows), then the rest by path. */
export function toContextRows(documents: ContextDocument[], attachedPaths: string[]): ContextRows {
  const byPath = new Map(documents.map((d) => [d.path, d]));
  const attachedSet = new Set(attachedPaths);
  const attached = attachedPaths.map((path): ContextRow => {
    const doc = byPath.get(path);
    return doc
      ? fromDocument(doc)
      : { path, ...splitPath(path), type: null, tokens: 0, isTooLarge: false, isMissing: true };
  });
  const unattached = documents
    .filter((d) => !attachedSet.has(d.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(fromDocument);
  return { attached, unattached };
}

/** Attach (append at the end) or detach a path; returns the new ordered list. */
export function toggleAttached(paths: string[], path: string, isOn: boolean): string[] {
  const without = paths.filter((p) => p !== path);
  return isOn ? [...without, path] : without;
}

/**
 * Move `activeId` to the position of `overId`. An `overId` that is not attached
 * (a drop below the attached rows) clamps to the last attached position. Unknown
 * `activeId`, no-op moves and lists of 0–1 items return the same reference.
 */
export function moveAttached(paths: string[], activeId: string, overId: string): string[] {
  if (paths.length < 2) return paths;
  const from = paths.indexOf(activeId);
  if (from < 0) return paths;
  const found = paths.indexOf(overId);
  const to = found < 0 ? paths.length - 1 : found;
  if (from === to) return paths;
  const next = [...paths];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Case-insensitive "path contains"; a blank query matches everything. */
export function matchesPath(row: Pick<ContextRow, "path">, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || row.path.toLowerCase().includes(q);
}

/** Tokens of the attached rows that exist in the repository (missing rows count 0). */
export function sumAttachedTokens(attached: ContextRow[]): number {
  return attached.reduce((sum, r) => sum + (r.isMissing ? 0 : r.tokens), 0);
}
