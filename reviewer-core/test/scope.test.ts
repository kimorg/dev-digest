import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyScopeFilter } from '../src/index.js';

function f(id: string, over: Partial<Finding> = {}): Finding {
  return {
    id,
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${id}`,
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: `why ${id}`,
    confidence: 0.5,
    kind: 'finding',
    ...over,
  };
}

describe('applyScopeFilter', () => {
  it('drops non-serious out-of-scope findings; keeps in-scope, untagged and non-finding kinds', () => {
    const r = applyScopeFilter([
      f('keep-true', { in_scope: true }),
      f('keep-missing'),
      f('drop', { in_scope: false }),
      f('leak', { in_scope: false, kind: 'secret_leak' }),
    ]);
    expect(r.kept.map((k) => k.id)).toEqual(['keep-true', 'keep-missing', 'leak']);
    expect(r.filtered.map((x) => x.finding.id)).toEqual(['drop']);
    expect(r.signal).toBeNull();
  });

  it('collapses serious out-of-scope findings (CRITICAL or security) into exactly one signal', () => {
    const r = applyScopeFilter([
      f('c1', { in_scope: false, severity: 'CRITICAL', confidence: 0.6 }),
      f('s1', { in_scope: false, category: 'security', confidence: 0.9 }),
      f('c2', { in_scope: false, severity: 'CRITICAL', confidence: 0.9 }),
    ]);
    expect(r.kept).toHaveLength(1);
    expect(r.signal?.id).toBe('c2');
    expect(r.collapsed).toBe(2);
    expect(r.kept[0]!.rationale).toContain("Outside this PR's stated scope");
    expect(r.kept[0]!.rationale).toContain('+2 more collapsed');
    expect(r.filtered).toHaveLength(2);
  });
});
