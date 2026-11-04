import type { BlastDegradedReason, BlastRadius } from "@devdigest/shared";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Numbers for the stat row. Endpoints and crons are counted once across all symbols. */
export function blastStats(blast: BlastRadius): BlastStats {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of blast.downstream) {
    callers += d.callers.length;
    d.endpoints_affected.forEach((e) => endpoints.add(e));
    d.crons_affected.forEach((c) => crons.add(c));
  }
  return { symbols: blast.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** `name()` for callables, the bare name otherwise. */
export function symbolLabel(name: string, kind: string | undefined): string {
  return kind === "function" || kind === "method" ? `${name}()` : name;
}

/**
 * Splits a path after every `/` so the UI can offer a line break (`<wbr>`) at
 * folder boundaries: `"a/b/c.ts:4"` → `["a/", "b/", "c.ts:4"]`. Joining the
 * parts gives back the input.
 */
export function pathSegments(path: string): string[] {
  return path.split(/(?<=\/)/);
}

/** Kind of each changed symbol by name (first declaration wins). */
export function kindsByName(blast: BlastRadius): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const s of blast.changed_symbols) if (!kinds.has(s.name)) kinds.set(s.name, s.kind);
  return kinds;
}

/** Reasons a resync can fix. `flag_off` and `repo_too_large` need a config change instead. */
const RESYNCABLE: readonly BlastDegradedReason[] = ["index_failed", "index_partial", "no_data"];

export function canResync(reason: BlastDegradedReason): boolean {
  return RESYNCABLE.includes(reason);
}

interface IndexStamp {
  lastIndexedSha: string;
  updatedAt: string;
}

/** True once the index row differs from the one captured when the resync started. */
export function indexAdvanced(before: IndexStamp | undefined, now: IndexStamp | undefined): boolean {
  if (!now) return false;
  if (!before) return true;
  return before.lastIndexedSha !== now.lastIndexedSha || before.updatedAt !== now.updatedAt;
}
