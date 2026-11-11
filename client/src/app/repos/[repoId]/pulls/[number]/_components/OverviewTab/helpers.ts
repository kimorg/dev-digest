import type { PrFile } from "@devdigest/shared";

const FILE_REF_RE = /^(.*?)(?::(\d+)(?:-\d+)?)?$/;

/** Split a model-written file ref — `path`, `path:12` or `path:12-18` — into the path and
    the first line (null when there is no usable line). */
export function parseFileRef(ref: string): { path: string; line: number | null } {
  const m = FILE_REF_RE.exec(ref.trim());
  const path = m?.[1] || ref.trim();
  const line = m?.[2] ? Number(m[2]) : null;
  return { path, line: line != null && line >= 1 ? line : null };
}

/** Whether `path` is one of this PR's changed files (a link there can open Files changed). */
export function isInDiff(files: readonly Pick<PrFile, "path">[], path: string): boolean {
  return files.some((f) => f.path === path);
}
