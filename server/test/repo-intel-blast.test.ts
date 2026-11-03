import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Persistent-path blast: per-symbol caller cap and honest degraded reasons.
 * No Postgres — the service's repository is patched (as in
 * repo-intel-facade-degraded.test.ts).
 */

function state(status: IndexState['status']): IndexState {
  return {
    repoId: 'r1',
    status,
    filesIndexed: 1,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'abc',
    indexerVersion: 1,
    updatedAt: new Date(0),
  };
}

function build(opts: { flag: boolean; state: IndexState | null; callerCounts?: Record<string, number> }) {
  const container = {
    config: { repoIntelEnabled: opts.flag },
    db: {} as never,
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
  } as never;
  const svc = new RepoIntelService(container);
  const counts = opts.callerCounts ?? { A: 25, B: 3 };
  const callerRows = Object.entries(counts).flatMap(([sym, n]) =>
    Array.from({ length: n }, (_, i) => ({
      fromPath: `callers/${sym}-${i}.ts`,
      toSymbol: sym,
      line: i + 1,
      rank: i, // higher index = higher rank
    })),
  );
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => null,
    tryGetIndexState: async () => opts.state,
    getSymbolRows: async (_repo: string, files: string[]) =>
      files.includes('src/a.ts')
        ? [
            { path: 'src/a.ts', name: 'A', kind: 'function', startLine: 1, endLine: 2 },
            { path: 'src/a.ts', name: 'B', kind: 'function', startLine: 3, endLine: 4 },
          ]
        : [],
    getResolvedCallers: async () => callerRows,
    getFileFacts: async () => [],
  };
  return svc;
}

describe('RepoIntel.getBlastRadius — persistent path', () => {
  it('caps callers per changed symbol and keeps the highest rank', async () => {
    const svc = build({ flag: true, state: state('full') });
    const r = await svc.getBlastRadius('r1', ['src/a.ts']);
    expect(r.degraded).toBe(false);
    expect(r.callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(20);
    expect(r.callers.filter((c) => c.viaSymbol === 'B')).toHaveLength(3);
    const aRanks = r.callers.filter((c) => c.viaSymbol === 'A').map((c) => c.rank);
    expect(Math.min(...aRanks)).toBe(5);
    expect(Math.max(...aRanks)).toBe(24);
  });

  it('partial index returns its data and index_partial', async () => {
    const r = await build({ flag: true, state: state('partial') }).getBlastRadius('r1', ['src/a.ts']);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('index_partial');
    expect(r.callers.length).toBe(23);
  });

  it('flag off → flag_off; failed index → index_failed; no state → no_data', async () => {
    expect((await build({ flag: false, state: null }).getBlastRadius('r1', ['src/a.ts'])).reason).toBe('flag_off');
    expect((await build({ flag: true, state: state('failed') }).getBlastRadius('r1', ['src/a.ts'])).reason).toBe('index_failed');
    expect((await build({ flag: true, state: null }).getBlastRadius('r1', ['src/a.ts'])).reason).toBe('no_data');
  });
});
