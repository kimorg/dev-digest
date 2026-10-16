// Run: node --test '.claude/skills/pr-self-review/scripts/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  globToRegExp, matchesAny, skillsFor, buildPlan, unroutedSkills, normalizeSeverity, validateFindings,
  dedupeFindings, decideVerdict, buildMarker, driftedFiles, evaluateCommit, evaluateCommits, evaluatePrHead,
  loadRouting, parseNameStatus, discoverSkills, repoRoot, typecheckTargets, parseTscOutput, depcruiseTargets,
  extractJsBlock, newViolations, importLine, violationFinding,
} from './lib.mjs';

const routing = loadRouting();

test('globToRegExp: **, *, ?, {a,b}, literal brackets', () => {
  assert.ok(matchesAny('client/src/app/agents/[id]/page.tsx', ['client/src/app/**']));
  assert.ok(matchesAny('client/src/app/agents/[id]/page.tsx', ['client/src/**/*.{ts,tsx}']));
  assert.ok(matchesAny('client/src/a.ts', ['client/src/**/*.ts']), '** matches zero segments');
  assert.ok(!matchesAny('client/src/a.tsx.bak', ['client/src/**/*.tsx']));
  assert.ok(matchesAny('README.md', ['**/*.md']));
  assert.ok(matchesAny('server/src/app.ts', ['server/src/{app,server}.ts']));
  assert.ok(!matchesAny('server/src/apps.ts', ['server/src/{app,server}.ts']));
  assert.ok(globToRegExp('a/?.ts').test('a/b.ts'));
  assert.ok(!globToRegExp('a/*.ts').test('a/b/c.ts'));
  assert.ok(!matchesAny('server/src/platform/clock.ts', routing.exclude), 'lockfile glob must not catch clock.ts');
});

test('skillsFor routes UI files to UI skills and backend files to backend skills', () => {
  const ui = skillsFor('client/src/app/agents/_components/AgentCard/AgentCard.tsx', routing);
  assert.ok(ui.includes('frontend-architecture') && ui.includes('react-best-practices') && ui.includes('next-best-practices'));
  assert.ok(!ui.includes('onion-architecture'));

  const be = skillsFor('server/src/modules/agents/repository.ts', routing);
  assert.ok(be.includes('onion-architecture') && be.includes('drizzle-orm-patterns') && be.includes('security'));
  assert.ok(!be.some((s) => ['frontend-architecture', 'react-best-practices'].includes(s)));

  assert.deepEqual(skillsFor('client/src/app/x/X.test.tsx', routing).filter((s) => s.startsWith('react')), ['react-testing-library']);
  assert.deepEqual(skillsFor('e2e/specs/01.flow.json', routing), []);
});

test('skillsFor honours `contains` lazily', () => {
  let calls = 0;
  const diff = (text) => () => (calls++, text);
  assert.ok(skillsFor('server/src/modules/x/schemas.ts', routing, diff("+import { z } from 'zod';")).includes('zod'));
  assert.ok(!skillsFor('server/src/modules/x/service.ts', routing, diff('+const a = 1;')).includes('zod'));
  calls = 0;
  skillsFor('e2e/specs/x.json', routing, diff(''));
  assert.equal(calls, 0, 'no diff read when no include matches');
});

test('buildPlan: buckets, excluded, unreviewed and unrouted skills', () => {
  const changes = [
    { path: 'client/src/lib/format-cost.ts', status: 'M', hash: 'a', added: 3, deleted: 1 },
    { path: 'server/src/modules/agents/service.ts', status: 'M', hash: 'b', added: 10, deleted: 0 },
    { path: 'e2e/specs/x.flow.json', status: '?', hash: 'c', added: 5, deleted: 0 },
    { path: 'client/INSIGHTS.md', status: 'M', hash: 'd', added: 2, deleted: 0 },
  ];
  const plan = buildPlan({
    base: 'HEAD0',
    changes,
    routing,
    discovered: [{ name: 'frontend-architecture', description: '' }, { name: 'brand-new', description: 'x' }],
    getText: () => '',
  });
  assert.equal(plan.empty, false);
  assert.deepEqual(plan.files.map((f) => f.path), ['client/src/lib/format-cost.ts', 'server/src/modules/agents/service.ts', 'e2e/specs/x.flow.json']);
  assert.deepEqual(plan.excludedFiles, ['client/INSIGHTS.md']);
  assert.deepEqual(plan.unreviewedFiles, ['e2e/specs/x.flow.json']);
  assert.deepEqual(plan.buckets['onion-architecture'], ['server/src/modules/agents/service.ts']);
  assert.deepEqual(plan.buckets['frontend-architecture'], ['client/src/lib/format-cost.ts']);
  assert.equal(plan.bucketLines['onion-architecture'], 10);
  assert.equal(plan.totalLines, 19);
  assert.deepEqual(plan.unroutedSkills.map((s) => s.name), ['brand-new']);
  assert.equal(buildPlan({ base: 'x', changes: [changes[3]], routing }).empty, true);
});

test('every installed skill in .claude/skills is routed or ignored', () => {
  const installed = discoverSkills(repoRoot());
  assert.ok(installed.length > 5);
  assert.deepEqual(unroutedSkills(installed, routing).map((s) => s.name), []);
});

test('normalizeSeverity: default map, per-skill map, advisory cap', () => {
  const rule = (skill) => routing.skills.find((r) => r.skill === skill);
  assert.equal(normalizeSeverity('critical', rule('react-best-practices')), 'CRITICAL');
  assert.equal(normalizeSeverity('HIGH', rule('react-best-practices')), 'WARNING');
  assert.equal(normalizeSeverity('MEDIUM', rule('react-best-practices')), 'SUGGESTION');
  assert.equal(normalizeSeverity('HIGH', rule('security')), 'CRITICAL');
  assert.equal(normalizeSeverity('LOW', rule('security')), 'WARNING');
  assert.equal(normalizeSeverity('CRITICAL', rule('typescript-expert')), 'WARNING');
  assert.equal(normalizeSeverity('BLOCKER', rule('security')), null);
});

test('validateFindings: CRITICAL needs line + path:line evidence; file must be in the bucket', () => {
  const ctx = { skill: 'onion-architecture', files: ['server/src/a.ts'], rule: routing.skills.find((r) => r.skill === 'onion-architecture') };
  const good = { file: 'server/src/a.ts', line: 3, severity: 'CRITICAL', title: 'service imports drizzle', evidence: 'server/src/a.ts:3' };
  assert.equal(validateFindings({ skill: 'onion-architecture', findings: [good] }, ctx).findings.length, 1);
  assert.match(validateFindings({ skill: 'onion-architecture', findings: [{ ...good, evidence: '' }] }, ctx).errors[0], /CRITICAL needs/);
  assert.match(validateFindings({ skill: 'onion-architecture', findings: [{ ...good, file: 'x.ts' }] }, ctx).errors[0], /not in this skill's bucket/);
  assert.match(validateFindings({ skill: 'wrong', findings: [] }, ctx).errors[0], /"skill" must be/);
  assert.match(validateFindings([], ctx).errors[0], /expected an object/);
  assert.deepEqual(validateFindings({ skill: 'onion-architecture', findings: [] }, ctx), { findings: [], errors: [] });
});

test('dedupeFindings keeps the highest severity; verdict blocks on any CRITICAL', () => {
  const f = (skill, severity) => ({ skill, file: 'a.ts', line: 1, severity, title: 'Same issue' });
  const merged = dedupeFindings([f('security', 'WARNING'), f('onion-architecture', 'CRITICAL'), { ...f('zod', 'SUGGESTION'), line: 2 }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].severity, 'CRITICAL');
  assert.deepEqual(merged[0].skills, ['security', 'onion-architecture']);
  assert.equal(decideVerdict(merged).verdict, 'BLOCKED');
  assert.equal(decideVerdict(merged.slice(1)).verdict, 'PASS');
});

test('buildMarker + driftedFiles', () => {
  const plan = { base: 'B', buckets: { zod: ['a.ts'] }, files: [{ path: 'a.ts', hash: 'h1' }, { path: 'b.ts', hash: 'deleted' }] };
  const m = buildMarker(plan, [], 'T');
  assert.deepEqual(m.files, { 'a.ts': 'h1', 'b.ts': 'deleted' });
  assert.equal(m.verdict, 'PASS');
  assert.deepEqual(driftedFiles(plan, [{ path: 'a.ts', hash: 'h1' }, { path: 'b.ts', hash: 'deleted' }], routing), []);
  assert.deepEqual(driftedFiles(plan, [{ path: 'a.ts', hash: 'h2' }, { path: 'b.ts', hash: 'deleted' }, { path: 'c.ts', hash: 'x' }, { path: 'n.md', hash: 'y' }], routing), ['a.ts', 'c.ts']);
});

test('evaluateCommit: no marker, stale, BLOCKED, PASS, excluded-only', () => {
  const marker = { verdict: 'PASS', files: { 'a.ts': 'h1', 'gone.ts': 'deleted' }, findings: [] };
  const staged = [{ path: 'a.ts', hash: 'h1' }, { path: 'gone.ts', hash: 'deleted' }];
  assert.equal(evaluateCommit({ marker, staged, routing }).ok, true);
  assert.equal(evaluateCommit({ marker: null, staged, routing }).ok, false);
  const stale = evaluateCommit({ marker, staged: [{ path: 'a.ts', hash: 'h2' }], routing });
  assert.equal(stale.ok, false);
  assert.deepEqual(stale.details, ['a.ts']);
  const blocked = evaluateCommit({
    marker: { ...marker, verdict: 'BLOCKED', findings: [{ severity: 'CRITICAL', file: 'a.ts', line: 4, title: 'x', skill: 's' }] },
    staged: [{ path: 'a.ts', hash: 'h1' }],
    routing,
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.details, ['a.ts:4 — x [s]']);
  assert.equal(evaluateCommit({ marker: null, staged: [{ path: 'docs/x.md', hash: 'z' }], routing }).ok, true);
});

test('evaluateCommits: unapproved commits block unless they only touch excluded files', () => {
  const commits = [
    { sha: 'c3'.padEnd(40, '0'), patchId: 'p3', files: ['client/src/a.ts'] },
    { sha: 'c2'.padEnd(40, '0'), patchId: 'p2', files: ['README.md'] },
    { sha: 'c1'.padEnd(40, '0'), patchId: 'p1', files: ['server/src/b.ts'] },
    { sha: 'c0'.padEnd(40, '0'), patchId: null, files: [] },
  ];
  assert.equal(evaluateCommits({ commits, approved: new Set(['p1', 'p3']), routing }).ok, true);
  const res = evaluateCommits({ commits, approved: new Set(['p3']), routing });
  assert.equal(res.ok, false);
  assert.deepEqual(res.details, ['c10000000000']);
  assert.match(res.hint[0], /git reset --soft c10000000000~1/);
  assert.equal(evaluateCommits({ commits: [], approved: new Set(), routing }).ok, true);
});

test('evaluatePrHead and parseNameStatus', () => {
  assert.equal(evaluatePrHead({ prHead: 'abc', localHead: 'abc' }).ok, true);
  assert.equal(evaluatePrHead({ prHead: 'abc', localHead: 'def' }).ok, false);
  assert.deepEqual(parseNameStatus('M\0a b.ts\0D\0c.ts\0'), [{ status: 'M', path: 'a b.ts' }, { status: 'D', path: 'c.ts' }]);
});

test('alsoWhen routes by content: drizzle in a service, risky APIs in client code', () => {
  const text = (t) => () => t;
  assert.ok(skillsFor('server/src/modules/agents/service.ts', routing, text("import { eq } from 'drizzle-orm';")).includes('drizzle-orm-patterns'));
  assert.ok(!skillsFor('server/src/modules/agents/service.ts', routing, text('const a = 1;')).includes('drizzle-orm-patterns'));
  assert.ok(skillsFor('server/src/db/schema/agents.ts', routing, text('')).includes('drizzle-orm-patterns'), 'base include still works');
  assert.ok(skillsFor('client/src/app/x/X.tsx', routing, text('<div dangerouslySetInnerHTML={{ __html: h }} />')).includes('security'));
  assert.ok(!skillsFor('client/src/app/x/X.tsx', routing, text('<div />')).includes('security'));
  assert.ok(!skillsFor('server/src/a.test.ts', routing, text("from 'drizzle-orm'")).includes('drizzle-orm-patterns'), 'exclude wins');
});

test('typecheckTargets: TS or setup files only; server and reviewer-core go together', () => {
  const f = (...paths) => paths.map((path) => ({ path, hash: 'h' }));
  assert.deepEqual(typecheckTargets(f('client/src/a.tsx', 'client/messages/en/x.json')), ['client']);
  assert.deepEqual(typecheckTargets(f('reviewer-core/src/a.ts')), ['reviewer-core', 'server']);
  assert.deepEqual(typecheckTargets(f('e2e/specs/x.flow.json')), []);
  assert.deepEqual(typecheckTargets(f('client/package.json')), ['client']);
});

test('parseTscOutput: package-relative paths, first line only, normalised', () => {
  const out = [
    "src/app/x/FindingCard.tsx(28,27): error TS2532: Object is possibly 'undefined'.",
    "  Some continuation line",
    "../reviewer-core/src/a.ts(3,1): error TS2304: Cannot find name 'x'.",
    'Found 2 errors.',
  ].join('\n');
  const f = parseTscOutput(out, 'client');
  assert.equal(f.length, 2);
  assert.deepEqual([f[0].file, f[0].line, f[0].severity, f[0].evidence], ['client/src/app/x/FindingCard.tsx', 28, 'CRITICAL', 'client/src/app/x/FindingCard.tsx:28']);
  assert.match(f[0].title, /^TS2532: Object is possibly/);
  assert.equal(parseTscOutput(out, 'server')[1].file, 'reviewer-core/src/a.ts');
});

test('depcruiseTargets ignores deleted files', () => {
  assert.deepEqual(depcruiseTargets([{ path: 'server/src/a.ts', hash: 'h' }]).map((t) => t.name), ['server']);
  assert.deepEqual(depcruiseTargets([{ path: 'server/src/a.ts', hash: 'deleted' }]), []);
  assert.deepEqual(depcruiseTargets([{ path: 'reviewer-core/src/b.ts', hash: 'h' }]).map((t) => t.name), ['reviewer-core']);
});

test('extractJsBlock takes the first js block of the right section only', () => {
  const md = '## Intro\n```js\nnope\n```\n## Server rules (`onion.cjs`)\ntext\n```js\nmodule.exports = 1;\n```\n## Other\n```js\nno\n```\n';
  assert.equal(extractJsBlock(md, 'Server rules'), 'module.exports = 1;\n');
  assert.equal(extractJsBlock('## Server rules\nno code\n## Next\n```js\nx\n```', 'Server rules'), null);
  assert.equal(extractJsBlock(md, 'Missing'), null);
});

test('newViolations: keyed by from + rule + specifier, so resolved-path drift is not "new"', () => {
  const v = (from, rule, unresolvedTo, to = 'x') => ({ from, to, unresolvedTo, rule: { name: rule } });
  const baseline = [v('src/routes/a.ts', 'no-orm', 'drizzle-orm', '../../../../home/u/server/node_modules/.pnpm/drizzle-orm/index.js')];
  const current = [
    v('src/routes/a.ts', 'no-orm', 'drizzle-orm', 'node_modules/.pnpm/drizzle-orm/index.js'), // same violation, other path
    v('src/modules/agents/service.ts', 'no-orm', 'drizzle-orm'),
    v('src/modules/agents/service.ts', 'no-schema', '../../db/schema/agents.js'),
    v('src/modules/other/service.ts', 'no-orm', 'drizzle-orm'), // new but not in a changed file
    v('../reviewer-core/src/x.ts', 'core-pure', 'fastify'),
  ];
  const fresh = newViolations({ baseline, current, cwd: 'server', changed: ['server/src/modules/agents/service.ts', 'reviewer-core/src/x.ts'] });
  assert.deepEqual(fresh.map((f) => `${f.file}|${f.rule.name}`), [
    'server/src/modules/agents/service.ts|no-orm',
    'server/src/modules/agents/service.ts|no-schema',
    'reviewer-core/src/x.ts|core-pure',
  ]);
  const text = "import a from 'x';\nimport { eq } from 'drizzle-orm';\n";
  assert.equal(importLine(text, 'drizzle-orm'), 2);
  const finding = violationFinding(fresh[0], importLine(text, 'drizzle-orm'));
  assert.equal(finding.severity, 'CRITICAL');
  assert.equal(finding.evidence, "server/src/modules/agents/service.ts:2 — import 'drizzle-orm'");
});

test('dedupeFindings: a reviewer finding on a line a tool flagged joins the tool finding', () => {
  const tool = { skill: 'dependency-cruiser', file: 's.ts', line: 11, severity: 'CRITICAL', title: 'New dependency-rule violation: imports drizzle-orm' };
  const merged = dedupeFindings([
    { skill: 'onion-architecture', file: 's.ts', line: 11, severity: 'CRITICAL', title: 'Service imports drizzle-orm directly' },
    tool,
    { skill: 'typescript-expert', file: 's.ts', line: 11, severity: 'WARNING', title: 'Unused import' },
    { skill: 'onion-architecture', file: 's.ts', line: 72, severity: 'WARNING', title: 'Container read on a legacy edge' },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].title, tool.title);
  assert.deepEqual(merged[0].skills, ['dependency-cruiser', 'onion-architecture', 'typescript-expert']);
  assert.deepEqual(merged[0].related, ['onion-architecture: Service imports drizzle-orm directly', 'typescript-expert: Unused import']);
  assert.equal(decideVerdict(merged).counts.CRITICAL, 1);
});
