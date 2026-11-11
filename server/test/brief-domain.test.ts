import { describe, it, expect } from 'vitest';
import type { BlastRadius, PrBriefModelResult } from '@devdigest/shared';
import {
  allowedBriefPaths,
  fitInputBudget,
  formatBlastSection,
  formatDiffStats,
  groundBriefOutput,
  isBriefStale,
  latestRunIdsPerAgent,
  parseFileRef,
  pickContextDocPaths,
} from '../src/modules/brief/domain.js';
import type { BriefInput } from '../src/modules/brief/types.js';

const emptyBlast: BlastRadius = {
  changed_symbols: [],
  downstream: [],
  summary: '',
  degraded: false,
  reason: null,
  caller_facts: [],
};

const risk = (over: Partial<PrBriefModelResult['risks'][number]> = {}) => ({
  kind: 'security',
  title: 'T',
  explanation: 'E',
  severity: 'high' as const,
  file_refs: ['a.ts'],
  ...over,
});

const allowed = new Set(['a.ts', 'b.ts']);

describe('brief domain — grounding (AC-25…AC-29)', () => {
  it('removes an invented ref and drops a risk left with none; keeps path:line refs (EC-4)', () => {
    const out = groundBriefOutput(
      {
        summary: 's',
        risks: [
          risk({ title: 'mixed', file_refs: ['a.ts:12', 'ghost.ts'] }),
          risk({ title: 'only-invented', file_refs: ['ghost.ts:3'] }),
        ],
        review_focus: [],
      },
      allowed,
    );
    expect(out.risks.map((r) => r.title)).toEqual(['mixed']);
    expect(out.risks[0]!.file_refs).toEqual(['a.ts:12']);
    expect(out.droppedRisks).toBe(1);
  });

  it('drops focus items with an invented file or line < 1 (AC-28)', () => {
    const out = groundBriefOutput(
      {
        summary: 's',
        risks: [],
        review_focus: [
          { file: 'a.ts', line: 0, reason: 'zero' },
          { file: 'a.ts', line: -4, reason: 'negative' },
          { file: 'ghost.ts', line: 3, reason: 'invented' },
          { file: 'b.ts', line: 7, reason: 'ok' },
        ],
      },
      allowed,
    );
    expect(out.reviewFocus).toEqual([{ file: 'b.ts', line: 7, reason: 'ok' }]);
    expect(out.droppedFocus).toBe(3);
  });

  it('clamps 7 risks to 6 and 9 items to 8 after dropping invented ones, in model order (D3)', () => {
    const risks = Array.from({ length: 7 }, (_, i) => risk({ title: `r${i}` }));
    // an invented one first: dropping happens before clamping, so r0..r5 all survive
    risks.unshift(risk({ title: 'bad', file_refs: ['ghost.ts'] }));
    const focus = Array.from({ length: 9 }, (_, i) => ({ file: 'a.ts', line: i + 1, reason: `f${i}` }));
    const out = groundBriefOutput({ summary: 's', risks, review_focus: focus }, allowed);
    expect(out.risks.map((r) => r.title)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    expect(out.reviewFocus.map((f) => f.reason)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7']);
  });

  it('cuts texts to 600 / 100 / 800 / 200 (AC-29, NFR-2)', () => {
    const out = groundBriefOutput(
      {
        summary: 's'.repeat(700),
        risks: [risk({ title: 't'.repeat(150), explanation: 'e'.repeat(900) })],
        review_focus: [{ file: 'a.ts', line: 1, reason: 'r'.repeat(300) }],
      },
      allowed,
    );
    expect(out.summary).toHaveLength(600);
    expect(out.risks[0]!.title).toHaveLength(100);
    expect(out.risks[0]!.explanation).toHaveLength(800);
    expect(out.reviewFocus[0]!.reason).toHaveLength(200);
  });

  it('allowed paths: PR files plus blast symbols and callers; empty blast → PR files only (AC-25, EC-8)', () => {
    expect([...allowedBriefPaths(['a.ts'], emptyBlast)]).toEqual(['a.ts']);
    const blast: BlastRadius = {
      ...emptyBlast,
      changed_symbols: [{ name: 'f', file: 'sym.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'f',
          callers: [{ file: 'caller.ts', line: 3, name: 'g' }],
          endpoints_affected: [],
          crons_affected: [],
        } as never,
      ],
    };
    const set = allowedBriefPaths(['a.ts'], blast);
    expect(set.has('sym.ts')).toBe(true);
    expect(set.has('caller.ts')).toBe(true);
  });

  it('parseFileRef: path:line, bare path, and a non-positive line', () => {
    expect(parseFileRef('a.ts:12')).toEqual({ path: 'a.ts', line: 12 });
    expect(parseFileRef('a.ts')).toEqual({ path: 'a.ts', line: null });
    expect(parseFileRef('a.ts:0')).toEqual({ path: 'a.ts', line: null });
  });

  it('parseFileRef: path:N-M splits at the colon and uses N as the line (spec file_refs grammar)', () => {
    expect(parseFileRef('src/a.ts:12-18')).toEqual({ path: 'src/a.ts', line: 12 });
    expect(parseFileRef('src/a.ts:12')).toEqual({ path: 'src/a.ts', line: 12 });
    expect(parseFileRef('src/a.ts')).toEqual({ path: 'src/a.ts', line: null });
  });

  it('parseFileRef: trims surrounding whitespace', () => {
    expect(parseFileRef('  src/a.ts:12  ')).toEqual({ path: 'src/a.ts', line: 12 });
  });

  it('parseFileRef: an empty path part falls back to the trimmed ref as path (line still parsed, matches client copy)', () => {
    expect(parseFileRef(':12')).toEqual({ path: ':12', line: 12 });
  });

  it('grounding keeps a padded ref to an allowed path, string stored as written (AC-26)', () => {
    const out = groundBriefOutput(
      { summary: 's', risks: [risk({ title: 'padded', file_refs: ['  a.ts:12  '] })], review_focus: [] },
      allowed,
    );
    expect(out.risks.map((r) => r.title)).toEqual(['padded']);
    expect(out.risks[0]!.file_refs).toEqual(['  a.ts:12  ']);
  });

  it('keeps a risk whose only ref is a range on an allowed path, ref string unchanged; drops a range on an invented path (AC-26)', () => {
    const out = groundBriefOutput(
      {
        summary: 's',
        risks: [
          risk({ title: 'range-ok', file_refs: ['a.ts:12-18'] }),
          risk({ title: 'range-ghost', file_refs: ['ghost.ts:12-18'] }),
        ],
        review_focus: [],
      },
      allowed,
    );
    expect(out.risks.map((r) => r.title)).toEqual(['range-ok']);
    expect(out.risks[0]!.file_refs).toEqual(['a.ts:12-18']);
    expect(out.droppedRisks).toBe(1);
  });
});

describe('brief domain — documents and staleness (AC-20, AC-5)', () => {
  it('docs come newest run first, deduped, at most 5', () => {
    expect(
      pickContextDocPaths([
        ['d1.md', 'd2.md'],
        ['d2.md', 'd3.md', 'd4.md'],
        ['d5.md', 'd6.md', 'd7.md'],
      ]),
    ).toEqual(['d1.md', 'd2.md', 'd3.md', 'd4.md', 'd5.md']);
    expect(pickContextDocPaths([])).toEqual([]);
  });

  it('latestRunIdsPerAgent keeps the newest run of each agent and skips runless reviews', () => {
    expect(
      latestRunIdsPerAgent([
        { agentId: 'A', runId: 'r3' },
        { agentId: 'B', runId: 'r2' },
        { agentId: 'A', runId: 'r1' },
        { agentId: 'C', runId: null },
      ]),
    ).toEqual(['r3', 'r2']);
  });

  it('isBriefStale compares head_sha', () => {
    expect(isBriefStale({ head_sha: 'a' }, 'a')).toBe(false);
    expect(isBriefStale({ head_sha: 'a' }, 'b')).toBe(true);
  });
});

describe('brief domain — input budget (AC-19, NFR-1)', () => {
  const files = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ path: `src/f${i}.ts`, additions: 1, deletions: 2 }));

  it('101 files → 100 listed + "+1 more files", with totals over all files', () => {
    const text = formatDiffStats(files(101));
    expect(text).toContain('+1 more files');
    expect(text).toContain('src/f99.ts +1 −2');
    expect(text).not.toContain('src/f100.ts');
    expect(text).toContain('Total: 101 files, +101 −202');
  });

  it('callers are shown as file:line', () => {
    const blast: BlastRadius = {
      ...emptyBlast,
      downstream: [
        {
          symbol: 'f',
          callers: [{ file: 'c.ts', line: 9, name: 'g' }],
          endpoints_affected: ['GET /x'],
          crons_affected: [],
        } as never,
      ],
    };
    const text = formatBlastSection(blast);
    expect(text).toContain('c.ts:9');
    expect(text).toContain('GET /x');
  });

  it('a huge input stays ≤ 40 000 and documents shrink before callers and files', () => {
    const blast: BlastRadius = {
      ...emptyBlast,
      summary: 'blast',
      downstream: [
        {
          symbol: 'f',
          callers: Array.from({ length: 60 }, (_, i) => ({ file: `c${i}.ts`, line: i + 1, name: 'g' })),
          endpoints_affected: [],
          crons_affected: [],
        } as never,
      ],
    };
    const input: BriefInput = {
      title: 'T'.repeat(1000),
      description: 'D'.repeat(50_000),
      issue: { number: 1, title: 'i', body: 'I'.repeat(50_000) },
      intent: { intent: 'x'.repeat(5000), in_scope: [], out_of_scope: [] },
      blast,
      files: files(300),
      docs: Array.from({ length: 5 }, (_, i) => ({ path: `d${i}.md`, content: 'x'.repeat(400_000) })),
    };
    const sys = 2000;
    const s = fitInputBudget(input, sys);
    const total =
      sys +
      s.title.length +
      (s.description?.length ?? 0) +
      (s.issue?.length ?? 0) +
      (s.intent?.length ?? 0) +
      s.blast.length +
      s.stats.length +
      s.docs.reduce((n, d) => n + d.content.length + d.path.length, 0);
    expect(total).toBeLessThanOrEqual(40_000);
    expect(s.title).toHaveLength(300);
    expect(s.description).toHaveLength(4000);
    // documents were shortened (per-doc 4 000, total 12 000 at most)
    expect(s.docs.reduce((n, d) => n + d.content.length, 0)).toBeLessThanOrEqual(12_000);
    // callers untouched when documents alone bring it under the budget
    expect(s.blast).toContain('c49.ts:50');
  });
});
