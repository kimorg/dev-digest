import type { BlastRadius, CallerFacts, DownstreamImpact } from '@devdigest/shared';
import type { BlastIndexRead, BlastSource } from './types.js';

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/** One-line summary built from numbers only (no model). */
export function buildBlastSummary(c: BlastCounts): string {
  return [
    plural(c.symbols, 'changed symbol', 'changed symbols'),
    plural(c.callers, 'caller', 'callers'),
    plural(c.endpoints, 'endpoint', 'endpoints'),
    plural(c.crons, 'cron', 'crons'),
  ].join(', ');
}

/** `'index'` iff the persistent index served the read (a partial index still does). */
export function blastSource(read: BlastIndexRead): BlastSource {
  return !read.degraded || read.reason === 'index_partial' ? 'index' : 'fallback';
}

/** Endpoints/crons per caller file, in the order the files first appear; files without facts are left out. */
function callerFacts(downstream: DownstreamImpact[], read: BlastIndexRead): CallerFacts[] {
  const out: CallerFacts[] = [];
  const seen = new Set<string>();
  for (const d of downstream) {
    for (const c of d.callers) {
      if (seen.has(c.file)) continue;
      seen.add(c.file);
      const facts = read.factsByFile?.[c.file];
      if (facts && (facts.endpoints.length > 0 || facts.crons.length > 0)) {
        out.push({ file: c.file, endpoints: [...facts.endpoints], crons: [...facts.crons] });
      }
    }
  }
  return out;
}

/**
 * Index read → `BlastRadius`. `downstream` holds the symbols with at least one caller, ordered by
 * the best caller rank, then caller count, then name; callers by rank, file, line.
 */
export function toBlastRadius(read: BlastIndexRead): BlastRadius {
  const declaredIn = new Map<string, Set<string>>();
  for (const s of read.changedSymbols) {
    const files = declaredIn.get(s.name) ?? new Set<string>();
    files.add(s.file);
    declaredIn.set(s.name, files);
  }

  const seen = new Set<string>();
  const bySymbol = new Map<string, BlastIndexRead['callers']>();
  const ranked = [...read.callers].sort(
    (a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line,
  );
  for (const c of ranked) {
    if (declaredIn.get(c.viaSymbol)?.has(c.file)) continue; // the declaring file is not a caller
    const key = `${c.viaSymbol}|${c.file}|${c.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = bySymbol.get(c.viaSymbol) ?? [];
    list.push(c);
    bySymbol.set(c.viaSymbol, list);
  }

  const downstream: (DownstreamImpact & { maxRank: number })[] = [];
  for (const [symbol, callers] of bySymbol) {
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of callers) {
      const facts = read.factsByFile?.[c.file];
      for (const e of facts?.endpoints ?? []) endpoints.add(e);
      for (const k of facts?.crons ?? []) crons.add(k);
    }
    downstream.push({
      symbol,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
      maxRank: callers[0]!.rank,
    });
  }
  downstream.sort(
    (a, b) =>
      b.maxRank - a.maxRank || b.callers.length - a.callers.length || a.symbol.localeCompare(b.symbol),
  );

  const allEndpoints = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const allCrons = new Set(downstream.flatMap((d) => d.crons_affected));
  return {
    changed_symbols: read.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream: downstream.map(({ maxRank: _maxRank, ...d }) => d),
    summary: buildBlastSummary({
      symbols: read.changedSymbols.length,
      callers: downstream.reduce((n, d) => n + d.callers.length, 0),
      endpoints: allEndpoints.size,
      crons: allCrons.size,
    }),
    degraded: read.degraded ?? false,
    reason: read.reason ?? null,
    caller_facts: callerFacts(downstream, read),
  };
}
