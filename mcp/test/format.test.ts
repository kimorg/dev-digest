import { describe, expect, it } from 'vitest';
import {
  clip,
  pickLatestResult,
  toAgentList,
  toConventionsResult,
  toReviewResult,
} from '../src/format.js';
import type { ApiFinding, ApiReview, ApiRun, ApiSeverity } from '../src/types.js';

const finding = (over: Partial<ApiFinding> = {}): ApiFinding => ({
  severity: 'WARNING',
  category: 'bug',
  title: 'Title',
  file: 'src/a.ts',
  start_line: 1,
  end_line: 2,
  rationale: 'because',
  dismissed_at: null,
  ...over,
});

const review = (over: Partial<ApiReview> = {}): ApiReview => ({
  id: 'rev-1',
  agent_id: 'a1',
  run_id: 'run-1',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'sum',
  score: 40,
  findings: [],
  ...over,
});

const run = (over: Partial<ApiRun> = {}): ApiRun => ({
  run_id: 'run-1',
  agent_id: 'a1',
  status: 'done',
  error: null,
  ...over,
});

const ctx = { repo: 'acme/api', pr: 7, agent: 'General' };

describe('clip', () => {
  it('strips control characters except newline and tab and truncates with an ellipsis', () => {
    expect(clip('a\u0000b\u001bc\nd\te', 50)).toBe('abc\nd\te');
    expect(clip('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('toReviewResult', () => {
  it('orders CRITICAL first, counts live findings, excludes and counts dismissed', () => {
    const result = toReviewResult(
      review({
        findings: [
          finding({ severity: 'SUGGESTION', title: 's' }),
          finding({ severity: 'CRITICAL', title: 'c' }),
          finding({ severity: 'WARNING', title: 'w', dismissed_at: '2026-01-01' }),
        ],
      }),
      ctx,
    );

    expect(result.findings.map((f) => f.title)).toEqual(['c', 's']);
    expect(result.counts).toEqual({ critical: 1, warning: 0, suggestion: 1 });
    expect(result.dismissed).toBe(1);
    expect(result.findings[0]?.lines).toBe('1-2');
    expect(result).not.toHaveProperty('more_findings');
  });

  it('caps findings at 30, keeping the most severe, and says what was omitted', () => {
    const findings = Array.from({ length: 60 }, (_, i) =>
      finding({ severity: (i < 5 ? 'CRITICAL' : 'SUGGESTION') as ApiSeverity, title: `f${i}` }),
    );

    const result = toReviewResult(review({ findings }), ctx);

    expect(result.findings).toHaveLength(30);
    expect(result.findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(5);
    expect(result.more_findings).toBe(30);
    expect(result.note).toContain('open the PR in the DevDigest UI');
  });

  it('keeps the worst case (60 maximal findings) under 20 000 characters', () => {
    const big = 'x'.repeat(5000);
    const findings = Array.from({ length: 60 }, () =>
      finding({ title: big, rationale: big, file: big, severity: 'CRITICAL' }),
    );

    const text = JSON.stringify(toReviewResult(review({ findings, summary: big }), ctx));

    expect(text.length).toBeLessThanOrEqual(20_000);
  });

  it('returns long rationales in full when the review fits the budget', () => {
    const long = 'r'.repeat(1500);
    const findings = Array.from({ length: 8 }, (_, i) =>
      finding({ severity: i < 2 ? 'CRITICAL' : 'WARNING', rationale: `${i}${long}` }),
    );

    const result = toReviewResult(review({ findings }), ctx);

    expect(result.findings.map((f) => f.rationale)).toEqual(findings.map((f) => f.rationale));
    expect(result).not.toHaveProperty('note');
  });

  it('spends the budget by severity: CRITICAL in full, then WARNING, SUGGESTION last', () => {
    const big = (tag: string) => tag + 'x'.repeat(5000);
    const result = toReviewResult(
      review({
        findings: [
          finding({ severity: 'SUGGESTION', title: 's1', rationale: big('s1') }),
          finding({ severity: 'WARNING', title: 'w1', rationale: big('w1') }),
          finding({ severity: 'CRITICAL', title: 'c1', rationale: big('c1') }),
          finding({ severity: 'SUGGESTION', title: 's2', rationale: big('s2') }),
          finding({ severity: 'WARNING', title: 'w2', rationale: big('w2') }),
          finding({ severity: 'CRITICAL', title: 'c2', rationale: big('c2') }),
        ],
      }),
      ctx,
    );
    const text = JSON.stringify(result);
    const byTitle = Object.fromEntries(result.findings.map((f) => [f.title, f.rationale]));

    expect(text.length).toBeLessThanOrEqual(20_000);
    expect(byTitle.c1).toBe(big('c1'));
    expect(byTitle.c2).toBe(big('c2'));
    // The two warnings split what is left evenly; the suggestions keep only the guaranteed minimum.
    for (const w of [byTitle.w1, byTitle.w2]) {
      expect(w?.endsWith('…')).toBe(true);
      expect(w?.length).toBeGreaterThan(1000);
    }
    expect(Math.abs((byTitle.w1?.length ?? 0) - (byTitle.w2?.length ?? 0))).toBeLessThanOrEqual(1);
    expect(byTitle.s1).toMatch(/^s1x+…$/);
    expect(byTitle.s1).toHaveLength(100);
    expect(byTitle.s2).toHaveLength(100);
    expect(result.note).toContain('Rationales shortened');
    // Nothing else is wasted: the response uses the budget almost exactly.
    expect(text.length).toBeGreaterThan(19_990);
  });

  it('splits the budget evenly inside one severity instead of letting the first long rationale take it', () => {
    const result = toReviewResult(
      review({
        findings: [
          finding({ severity: 'CRITICAL', title: 'giant', rationale: 'g'.repeat(40_000) }),
          finding({ severity: 'CRITICAL', title: 'short', rationale: 's'.repeat(800) }),
          ...Array.from({ length: 4 }, (_, i) =>
            finding({ severity: 'CRITICAL', title: `long${i}`, rationale: 'l'.repeat(6000) }),
          ),
          finding({ severity: 'WARNING', title: 'w', rationale: 'w'.repeat(3000) }),
        ],
      }),
      ctx,
    );
    const byTitle = Object.fromEntries(result.findings.map((f) => [f.title, f.rationale]));
    const longs = ['giant', 'long0', 'long1', 'long2', 'long3'].map((t) => byTitle[t]?.length ?? 0);

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(20_000);
    expect(byTitle.short).toBe('s'.repeat(800)); // below the fair share: kept in full
    expect(Math.max(...longs) - Math.min(...longs)).toBeLessThanOrEqual(1);
    expect(Math.min(...longs)).toBeGreaterThan(3000);
    expect(byTitle.w).toHaveLength(100); // lower severity waits until every CRITICAL is in full
  });

  it('still gives every finding a minimum rationale when one CRITICAL alone exceeds the budget', () => {
    const result = toReviewResult(
      review({
        findings: [
          finding({ severity: 'CRITICAL', title: 'c', rationale: 'c'.repeat(50_000) }),
          ...Array.from({ length: 5 }, (_, i) =>
            finding({ severity: 'SUGGESTION', title: `s${i}`, rationale: 's'.repeat(400) }),
          ),
        ],
      }),
      ctx,
    );

    expect(JSON.stringify(result).length).toBeLessThanOrEqual(20_000);
    expect(result.findings[0]?.rationale.length).toBeGreaterThan(15_000);
    for (const f of result.findings.slice(1)) expect(f.rationale).toHaveLength(100);
  });

  it('counts JSON escapes against the budget', () => {
    const escaped = '"\\\n'.repeat(4000); // every char doubles when serialized
    const findings = Array.from({ length: 30 }, (_, i) =>
      finding({ severity: i % 2 ? 'WARNING' : 'CRITICAL', rationale: escaped, title: '"'.repeat(50) }),
    );

    const text = JSON.stringify(toReviewResult(review({ findings }), ctx));

    expect(text.length).toBeLessThanOrEqual(20_000);
    // A 2-char escape is never split, so each of the 30 clipped rationales may leave 1 char unused.
    expect(text.length).toBeGreaterThanOrEqual(20_000 - 30);
  });
});

describe('pickLatestResult', () => {
  it('reports a running latest run before any older review', () => {
    const picked = pickLatestResult(
      [run({ run_id: 'run-2', status: 'running' }), run()],
      [review()],
      'a1',
    );
    expect(picked).toEqual({ kind: 'running', runId: 'run-2' });
  });

  it('returns the latest review of this agent only, with a note when a later run failed', () => {
    const picked = pickLatestResult(
      [run({ run_id: 'run-3', status: 'failed', error: 'no key' }), run({ run_id: 'run-1' })],
      [
        review({ id: 'other', agent_id: 'a2', run_id: 'run-9' }),
        review({ id: 'mine', run_id: 'run-1' }),
      ],
      'a1',
    );

    expect(picked.kind).toBe('review');
    if (picked.kind !== 'review') return;
    expect(picked.review.id).toBe('mine');
    expect(picked.note).toContain('run-3 failed: no key');
  });

  it('returns no result plus the last error when every run failed', () => {
    const picked = pickLatestResult(
      [run({ status: 'failed', error: 'boom' })],
      [],
      'a1',
    );
    expect(picked).toEqual({ kind: 'none', lastError: 'boom' });
  });
});

describe('list / conventions formatters', () => {
  it('never exposes system_prompt and caps agents', () => {
    const agents = Array.from({ length: 60 }, (_, i) => ({
      id: `a${i}`,
      name: `n${i}`,
      description: 'd'.repeat(500),
      model: 'm',
      enabled: true,
      system_prompt: 'SECRET',
    }));
    const out = toAgentList(agents);
    expect(out.agents).toHaveLength(50);
    expect(out.agents[0]?.description).toHaveLength(160);
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });

  it('puts accepted conventions first and formats evidence as path:a-b', () => {
    const out = toConventionsResult('acme/api', {
      scan: { status: 'done', error: null, created_at: 't' },
      candidates: [
        { rule: 'pending one', status: 'pending', evidence_path: 'a.ts', evidence_line_start: 1, evidence_line_end: 3 },
        { rule: 'accepted one', status: 'accepted', evidence_path: 'b.ts', evidence_line_start: 4, evidence_line_end: 9 },
      ],
    });
    expect(out.conventions.map((c) => c.rule)).toEqual(['accepted one', 'pending one']);
    expect(out.conventions[0]?.evidence).toBe('b.ts:4-9');
  });
});
