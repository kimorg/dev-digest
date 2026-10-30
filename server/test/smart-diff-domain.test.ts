import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, classifyFile, latestReviewIdsPerAgent } from '../src/modules/smart-diff/domain.js';

const ROLE_TABLE: [string, string][] = [
  ['src/__tests__/__snapshots__/x.snap', 'boilerplate'],
  ['.claude/skills/security/SKILL.md', 'wiring'],
  ['e2e/README.md', 'tests'],
  ['pnpm-lock.yaml', 'boilerplate'],
  ['package-lock.json', 'boilerplate'],
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'],
  ['test/fixtures/package-lock.json', 'boilerplate'],
  ['package.json', 'boilerplate'],
  ['server/package.json', 'boilerplate'],
  ['dist/server.js', 'boilerplate'],
  ['client/dist/a.js', 'boilerplate'],
  ['src/api.generated.ts', 'boilerplate'],
  ['public/app.min.js', 'boilerplate'],
  ['src/index.ts', 'wiring'],
  ['client/src/components/diff-viewer/index.ts', 'wiring'],
  ['docs/index.ts', 'wiring'],
  ['vite.config.ts', 'wiring'],
  ['tsconfig.test.json', 'wiring'],
  ['.eslintrc.cjs', 'wiring'],
  ['.env.example', 'wiring'],
  ['docker-compose.dev.yml', 'wiring'],
  ['.github/workflows/ci.yml', 'wiring'],
  ['src/config.ts', 'core'],
  ['src/middleware/ratelimit.ts', 'core'],
  ['src/contest.ts', 'core'],
  ['src/latest/a.ts', 'core'],
  ['src/builder.ts', 'core'],
  ['src/a.test.ts', 'tests'],
  ['x.it.test.ts', 'tests'],
  ['Button.test.tsx', 'tests'],
  ['foo.spec.js', 'tests'],
  ['server/test/helpers/pg.ts', 'tests'],
  ['tests/a.ts', 'tests'],
  ['e2e/specs/05.flow.json', 'tests'],
  ['README.md', 'docs'],
  ['readme.md', 'docs'],
  ['server/README.md', 'docs'],
  ['docs/guide.txt', 'docs'],
  ['CHANGELOG.md', 'docs'],
  ['LICENSE', 'docs'],
];

describe('classifyFile — path to role', () => {
  it.each(ROLE_TABLE)('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

const ROLES = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

describe('buildSmartDiff — assembly', () => {
  it('always returns the 5 groups in display order, even when empty', () => {
    const d = buildSmartDiff([], []);
    expect(d.groups.map((g) => g.role)).toEqual(ROLES);
    expect(d.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(SmartDiff.safeParse(d).success).toBe(true);
    expect(d.split_suggestion).toEqual({ too_big: false, total_lines: 0, proposed_splits: [] });
  });

  it('sorts files by path, sums lines, and lists unique sorted finding lines of live findings only', () => {
    const d = buildSmartDiff(
      [
        { path: 'src/b.ts', additions: 3, deletions: 1 },
        { path: 'src/a.ts', additions: 10, deletions: 2 },
        { path: 'src/a.test.ts', additions: 5, deletions: 0 },
        { path: 'README.md', additions: 1, deletions: 1 },
      ],
      [
        { file: 'src/a.ts', startLine: 20, dismissed: false },
        { file: 'src/a.ts', startLine: 4, dismissed: false },
        { file: 'src/a.ts', startLine: 20, dismissed: false },
        { file: 'src/a.ts', startLine: 99, dismissed: true },
        { file: 'src/elsewhere.ts', startLine: 1, dismissed: false },
      ],
    );
    const byRole = Object.fromEntries(d.groups.map((g) => [g.role, g.files]));
    expect(byRole.core!.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(byRole.core![0]!.finding_lines).toEqual([4, 20]);
    expect(byRole.core![1]!.finding_lines).toEqual([]);
    expect(byRole.tests!.map((f) => f.path)).toEqual(['src/a.test.ts']);
    expect(byRole.docs!.map((f) => f.path)).toEqual(['README.md']);
    expect(d.split_suggestion.total_lines).toBe(10 + 2 + 3 + 1 + 5 + 2);
    expect(d.split_suggestion.too_big).toBe(false);
  });
});

describe('latestReviewIdsPerAgent — newest-first heads', () => {
  it('keeps the first (newest) review per agent; a null agent is one group', () => {
    const ids = latestReviewIdsPerAgent([
      { id: 'a-new', agentId: 'A' },
      { id: 'n-new', agentId: null },
      { id: 'a-old', agentId: 'A' },
      { id: 'b-1', agentId: 'B' },
      { id: 'n-old', agentId: null },
    ]);
    expect(ids).toEqual(['a-new', 'n-new', 'b-1']);
  });
});
