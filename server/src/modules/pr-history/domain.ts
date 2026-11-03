import type { AssociatedPullRef, PrHistoryItem } from '@devdigest/shared';
import type { HistoryFile, ShaHit } from './types.js';

/** The files worth asking about: most changed lines first, then path. */
export function pickHistoryFiles(files: HistoryFile[], max: number): string[] {
  return [...files]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions) || a.path.localeCompare(b.path))
    .slice(0, max)
    .map((f) => f.path);
}

/**
 * Merges per-file commit lists round-robin (newest first per file), so every file is represented
 * under the cap. A sha seen again only adds its path.
 */
export function pickHistoryShas(perFile: { path: string; shas: string[] }[], max: number): ShaHit[] {
  const picked = new Map<string, ShaHit>();
  const depth = Math.max(0, ...perFile.map((f) => f.shas.length));
  for (let i = 0; i < depth; i++) {
    for (const file of perFile) {
      const sha = file.shas[i];
      if (sha === undefined) continue;
      const existing = picked.get(sha);
      if (existing) {
        if (!existing.paths.includes(file.path)) existing.paths.push(file.path);
      } else if (picked.size < max) {
        picked.set(sha, { sha, paths: [file.path] });
      }
    }
  }
  return [...picked.values()];
}

/** Merged PRs only, without the current one, one entry per number, newest merge first, capped. */
export function mergeHistory(
  hits: { paths: string[]; pulls: AssociatedPullRef[] }[],
  currentNumber: number,
  max: number,
): PrHistoryItem[] {
  const byNumber = new Map<number, PrHistoryItem>();
  for (const hit of hits) {
    for (const pr of hit.pulls) {
      if (pr.merged_at === null || pr.number === currentNumber) continue;
      const existing = byNumber.get(pr.number);
      if (existing) {
        for (const p of hit.paths) if (!existing.files_overlap.includes(p)) existing.files_overlap.push(p);
      } else {
        byNumber.set(pr.number, {
          pr_number: pr.number,
          title: pr.title,
          merged_at: pr.merged_at,
          author: pr.author,
          files_overlap: [...hit.paths],
          notes: '',
        });
      }
    }
  }
  return [...byNumber.values()].sort((a, b) => b.merged_at.localeCompare(a.merged_at)).slice(0, max);
}
