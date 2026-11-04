import type { BlastDegradedReason } from '@devdigest/shared';

/**
 * Structural mirror of repo-intel's `BlastResult` (modules may not import each other's
 * internals). `wiring.ts` passes `container.repoIntel` as a `BlastIndex`, so typecheck
 * fails if the two shapes drift.
 */
export interface BlastIndexRead {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}

/** What the blast read needs to know about a PR. */
export interface BlastTarget {
  repoId: string;
  files: string[];
}

/** Where the map came from — logged by the route. */
export type BlastSource = 'index' | 'fallback';
