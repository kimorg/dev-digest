import { describe, it, expect } from 'vitest';
import {
  classifyContextPath,
  validateContextPath,
  mergeContextPaths,
} from '../src/modules/project-context/domain.js';

// SPEC-005 "Patterns and types", AC-16, AC-38. Pure functions, no I/O.
describe('classifyContextPath (AC-4, AC-5, AC-60, AC-61, EC-15…EC-17)', () => {
  it.each([
    ['server/INSIGHTS.md', 'insights'], // priority 1 beats readme (AC-60, EC-15)
    ['mcp/INSIGHTS.md', 'insights'],
    ['server/AGENTS.md', 'readme'], // EC-16: AGENTS.md is listed
    ['reviewer-core/README.md', 'readme'],
    ['server/docs/auth.md', 'docs'],
    ['client/docs/deep/nested.md', 'docs'],
    ['server/specs/003-skills.md', 'specs'],
    ['specs/005-project-context.md', 'specs'],
    ['specs/a/b.md', 'specs'],
    ['docs/plans/006-x.md', 'plans'],
  ])('%s → %s', (path, type) => {
    expect(classifyContextPath(path)).toBe(type);
  });

  it.each([
    'server/CLAUDE.md', // exclusion (AC-61, EC-16)
    'e2e/CLAUDE.md',
    'server/src/modules/repo-intel/README.md', // EC-17: <pkg>/*.md is the package root only
    'README.md', // repo root is not a package
    'docs/guide.md', // only docs/plans is a pattern at the root
    'other/README.md', // not one of the known packages
    'server/notes.txt', // not markdown
  ])('%s → null', (path) => {
    expect(classifyContextPath(path)).toBeNull();
  });
});

describe('validateContextPath (AC-16)', () => {
  it('accepts a path that matches a pattern, up to 512 chars', () => {
    expect(validateContextPath('server/AGENTS.md')).toBe(true);
    const prefix = 'server/docs/';
    const ok = prefix + 'a'.repeat(512 - prefix.length - 3) + '.md';
    expect(ok).toHaveLength(512);
    expect(validateContextPath(ok)).toBe(true);
  });

  it.each([
    ['absolute', '/etc/passwd.md'],
    ['parent segment', 'server/docs/../../x.md'],
    ['leading parent', '../server/AGENTS.md'],
    ['.git segment', 'server/docs/.git/x.md'],
    ['.git root', '.git/config'],
    ['513 chars', 'server/docs/' + 'a'.repeat(513 - 'server/docs/'.length - 3) + '.md'],
    ['matches no pattern', 'foo.md'],
    ['CLAUDE.md', 'server/CLAUDE.md'],
    ['empty', ''],
  ])('rejects %s', (_label, path) => {
    expect(validateContextPath(path)).toBe(false);
  });
});

describe('mergeContextPaths (AC-38, EC-4, EC-19)', () => {
  const p = (path: string, order: number) => ({ path, order });

  it('puts the agent first, then skills in the given order; a repeated path keeps its first position', () => {
    const merged = mergeContextPaths(
      [p('server/AGENTS.md', 0), p('server/README.md', 1)],
      [
        // S1 repeats the agent's AGENTS.md (EC-4) and has auth.md
        { skillId: 's1', paths: [p('server/docs/auth.md', 1), p('server/AGENTS.md', 0)] },
        // S2 repeats S1's auth.md (EC-19)
        { skillId: 's2', paths: [p('server/docs/auth.md', 0), p('server/docs/db.md', 1)] },
      ],
    );
    expect(merged).toEqual([
      { path: 'server/AGENTS.md', source: 'agent', skillId: null },
      { path: 'server/README.md', source: 'agent', skillId: null },
      { path: 'server/docs/auth.md', source: 'skill', skillId: 's1' },
      { path: 'server/docs/db.md', source: 'skill', skillId: 's2' },
    ]);
  });

  it('returns an empty list when nothing is attached', () => {
    expect(mergeContextPaths([], [{ skillId: 's1', paths: [] }])).toEqual([]);
  });
});
