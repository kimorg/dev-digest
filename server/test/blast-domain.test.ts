import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { toBlastRadius, buildBlastSummary, blastSource } from '../src/modules/blast/domain.js';
import type { BlastIndexRead } from '../src/modules/blast/types.js';

const sym = (file: string, name: string, kind = 'function') => ({ file, name, kind });
const caller = (file: string, symbol: string, viaSymbol: string, line: number, rank: number) => ({
  file,
  symbol,
  viaSymbol,
  line,
  rank,
});

describe('toBlastRadius — mapping', () => {
  it('groups callers by changed symbol, ordered by max rank, then count, then name', () => {
    const read: BlastIndexRead = {
      changedSymbols: [sym('a.ts', 'alpha'), sym('a.ts', 'beta'), sym('a.ts', 'gamma')],
      callers: [
        caller('c1.ts', 'one', 'alpha', 3, 0.1),
        caller('c2.ts', 'two', 'beta', 5, 0.9),
        caller('c3.ts', 'three', 'beta', 7, 0.2),
      ],
    };
    const out = toBlastRadius(read);
    expect(out.changed_symbols.map((s) => s.name)).toEqual(['alpha', 'beta', 'gamma']);
    expect(out.downstream.map((d) => d.symbol)).toEqual(['beta', 'alpha']);
    expect(out.downstream[0]!.callers.map((c) => c.name)).toEqual(['two', 'three']);
  });

  it('drops a caller living in the declaring file and de-duplicates (viaSymbol, file, line)', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('a.ts', 'alpha')],
      callers: [
        caller('a.ts', 'self', 'alpha', 1, 1),
        caller('b.ts', 'x', 'alpha', 4, 1),
        caller('b.ts', 'x2', 'alpha', 4, 0.5),
      ],
    });
    expect(out.downstream).toHaveLength(1);
    expect(out.downstream[0]!.callers).toEqual([{ name: 'x', file: 'b.ts', line: 4 }]);
  });

  it('keeps changed_symbols and gives empty downstream when there are no callers', () => {
    const out = toBlastRadius({ changedSymbols: [sym('a.ts', 'alpha')], callers: [] });
    expect(out.downstream).toEqual([]);
    expect(out.changed_symbols).toHaveLength(1);
    expect(out.degraded).toBe(false);
    expect(out.reason).toBeNull();
  });

  it('passes degraded and reason through', () => {
    const out = toBlastRadius({ changedSymbols: [], callers: [], degraded: true, reason: 'no_data' });
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
  });

  it('attributes endpoints and crons separately, de-duplicated, from caller files', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('a.ts', 'alpha')],
      callers: [caller('r1.ts', 'h1', 'alpha', 1, 1), caller('r2.ts', 'h2', 'alpha', 2, 1)],
      factsByFile: {
        'r1.ts': { endpoints: ['GET /x'], crons: ['nightly'] },
        'r2.ts': { endpoints: ['GET /x', 'POST /y'], crons: [] },
      },
    });
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /x', 'POST /y']);
    expect(out.downstream[0]!.crons_affected).toEqual(['nightly']);
  });

  it('fallback without factsByFile yields no endpoints or crons', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('a.ts', 'alpha')],
      callers: [caller('r1.ts', 'h1', 'alpha', 1, 0)],
      degraded: true,
      reason: 'no_data',
    });
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
    expect(out.downstream[0]!.crons_affected).toEqual([]);
  });

  it('builds a summary from numbers and the output satisfies the contract', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('a.ts', 'alpha')],
      callers: [caller('r1.ts', 'h1', 'alpha', 1, 1)],
      factsByFile: { 'r1.ts': { endpoints: ['GET /x'], crons: [] } },
    });
    expect(out.summary).toBe(buildBlastSummary({ symbols: 1, callers: 1, endpoints: 1, crons: 0 }));
    expect(out.summary).toContain('1 changed symbol');
    expect(() => BlastRadius.parse(out)).not.toThrow();
  });
});

describe('toBlastRadius — caller_facts', () => {
  it('lists endpoints/crons per caller file once, skipping files without facts', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('a.ts', 'alpha'), sym('a.ts', 'beta')],
      callers: [
        caller('r1.ts', 'h1', 'alpha', 1, 1),
        caller('r1.ts', 'h1b', 'beta', 2, 0.9),
        caller('r2.ts', 'h2', 'alpha', 2, 0.8),
        caller('r3.ts', 'h3', 'alpha', 3, 0.7),
      ],
      factsByFile: {
        'r1.ts': { endpoints: ['GET /x'], crons: ['nightly'] },
        'r2.ts': { endpoints: [], crons: [] },
      },
    });
    expect(out.caller_facts).toEqual([{ file: 'r1.ts', endpoints: ['GET /x'], crons: ['nightly'] }]);
  });

  it('is empty without factsByFile (fallback)', () => {
    const out = toBlastRadius({
      changedSymbols: [sym('a.ts', 'alpha')],
      callers: [caller('r1.ts', 'h1', 'alpha', 1, 0)],
      degraded: true,
      reason: 'no_data',
    });
    expect(out.caller_facts).toEqual([]);
  });
});

describe('blastSource', () => {
  it('is index unless degraded (index_partial still reads the index)', () => {
    expect(blastSource({ changedSymbols: [], callers: [] })).toBe('index');
    expect(blastSource({ changedSymbols: [], callers: [], degraded: true, reason: 'index_partial' })).toBe('index');
    expect(blastSource({ changedSymbols: [], callers: [], degraded: true, reason: 'no_data' })).toBe('fallback');
  });
});
