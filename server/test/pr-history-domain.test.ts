import { describe, it, expect } from 'vitest';
import { PrHistoryItem } from '@devdigest/shared';
import { mergeHistory, pickHistoryFiles, pickHistoryShas } from '../src/modules/pr-history/domain.js';

const pull = (number: number, merged_at: string | null, title = `PR ${number}`) => ({
  number,
  title,
  author: 'dev',
  merged_at,
});

describe('pickHistoryFiles', () => {
  it('orders by changed lines desc, then path, and caps', () => {
    const files = [
      { path: 'b.ts', additions: 1, deletions: 1 },
      { path: 'a.ts', additions: 1, deletions: 1 },
      { path: 'big.ts', additions: 50, deletions: 5 },
      { path: 'small.ts', additions: 0, deletions: 1 },
    ];
    expect(pickHistoryFiles(files, 3)).toEqual(['big.ts', 'a.ts', 'b.ts']);
  });
});

describe('pickHistoryShas', () => {
  it('round-robins across files, newest first, de-duplicates and keeps every file represented', () => {
    const picked = pickHistoryShas(
      [
        { path: 'a.ts', shas: ['a1', 'a2', 'a3'] },
        { path: 'b.ts', shas: ['b1', 'a1'] },
        { path: 'c.ts', shas: ['c1', 'c2'] },
      ],
      10,
    );
    expect(picked.map((p) => p.sha)).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3']);
    expect(picked.find((p) => p.sha === 'a1')!.paths).toEqual(['a.ts', 'b.ts']);
  });

  it('caps the number of shas at max while every file still gets its newest one', () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((p) => ({
      path: `${p}.ts`,
      shas: [`${p}1`, `${p}2`, `${p}3`],
    }));
    const picked = pickHistoryShas(files, 10);
    expect(picked).toHaveLength(10);
    expect(picked.slice(0, 5).map((p) => p.sha)).toEqual(['a1', 'b1', 'c1', 'd1', 'e1']);
  });
});

describe('mergeHistory', () => {
  it('keeps merged PRs only, excludes the current one, de-duplicates, unions overlap, sorts by merged_at desc', () => {
    const out = mergeHistory(
      [
        { paths: ['a.ts'], pulls: [pull(10, '2026-01-01T00:00:00Z'), pull(11, null), pull(99, '2026-05-01T00:00:00Z')] },
        { paths: ['b.ts'], pulls: [pull(10, '2026-01-01T00:00:00Z'), pull(12, '2026-03-01T00:00:00Z')] },
      ],
      99,
      5,
    );
    expect(out.map((i) => i.pr_number)).toEqual([12, 10]);
    expect(out[1]!.files_overlap).toEqual(['a.ts', 'b.ts']);
    expect(out.every((i) => i.notes === '')).toBe(true);
    for (const item of out) expect(() => PrHistoryItem.parse(item)).not.toThrow();
  });

  it('caps at max, keeping the most recent', () => {
    const pulls = Array.from({ length: 8 }, (_, i) => pull(i + 1, `2026-01-0${i + 1}T00:00:00Z`));
    const out = mergeHistory([{ paths: ['a.ts'], pulls }], 100, 5);
    expect(out.map((i) => i.pr_number)).toEqual([8, 7, 6, 5, 4]);
  });
});
