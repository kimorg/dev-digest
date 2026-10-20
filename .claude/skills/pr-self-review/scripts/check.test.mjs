// End-to-end: real git repos with the hooks enabled. Run: node --test '.claude/skills/pr-self-review/scripts/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { SKILL_DIR, repoRoot } from './lib.mjs';

const SRC_ROOT = repoRoot();
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'PR_SELF_REVIEW_SKIP'));
Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });

const run = (cmd, args, cwd, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
};
const git = (repo, ...args) => run('git', args, repo);
const mustGit = (repo, ...args) => {
  const r = git(repo, ...args);
  assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.err}`);
  return r.out.trim();
};
const write = (repo, path, text) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const script = (repo, name) => join(repo, '.claude/skills/pr-self-review/scripts', name);

/** Fresh repo + bare origin, hooks enabled, skill copied in, on branch `feat`. */
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'psr-'));
  const remote = join(dir, 'origin.git');
  const repo = join(dir, 'repo');
  run('git', ['init', '-q', '--bare', '-b', 'main', remote], dir);
  run('git', ['init', '-q', '-b', 'main', repo], dir);
  for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.com'], ['commit.gpgsign', 'false'], ['core.hooksPath', '.githooks']]) {
    mustGit(repo, 'config', k, v);
  }
  cpSync(SKILL_DIR, join(repo, '.claude/skills/pr-self-review'), { recursive: true });
  cpSync(join(SRC_ROOT, '.claude/skills/engineering-insights/scripts/lib.mjs'), join(repo, '.claude/skills/engineering-insights/scripts/lib.mjs'));
  cpSync(join(SRC_ROOT, '.githooks'), join(repo, '.githooks'), { recursive: true });
  write(repo, 'README.md', '# t\n');
  mustGit(repo, 'add', '-A');
  mustGit(repo, 'commit', '-qm', 'init'); // excluded files only → allowed without a review
  mustGit(repo, 'remote', 'add', 'origin', remote);
  mustGit(repo, 'push', '-q', '-u', 'origin', 'main');
  mustGit(repo, 'checkout', '-qb', 'feat');
  return repo;
}

/** Run collect → write findings per bucket → verdict. Returns verdict's result plus the plan. */
function review(repo, findingsBySkill = {}, { between } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'psr-run-'));
  const c = run(process.execPath, [script(repo, 'collect.mjs')], repo);
  assert.equal(c.status, 0, c.err);
  writeFileSync(join(tmp, 'plan.json'), c.out);
  const plan = JSON.parse(c.out);
  mkdirSync(join(tmp, 'findings'));
  for (const skill of Object.keys(plan.buckets)) {
    writeFileSync(join(tmp, 'findings', `${skill}.json`), JSON.stringify({ skill, findings: findingsBySkill[skill] ?? [] }));
  }
  between?.();
  return { ...run(process.execPath, [script(repo, 'verdict.mjs'), join(tmp, 'plan.json'), join(tmp, 'findings')], repo), plan };
}

const critical = (file) => ({
  'frontend-architecture': [{ file, line: 1, severity: 'CRITICAL', title: 'feature imports another feature', evidence: `${file}:1` }],
});

test('commit without a review is blocked with an instruction for the agent', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  mustGit(repo, 'add', '-A');
  const r = git(repo, 'commit', '-qm', 'a');
  assert.notEqual(r.status, 0);
  assert.match(r.err, /no review found/);
  assert.match(r.err, /Read and follow \.claude\/skills\/pr-self-review\/SKILL\.md/);
});

test('PASS → commit and push go through; an edit after the review is stale', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  const v = review(repo);
  assert.equal(v.status, 0, v.err);
  assert.match(v.out, /PR self-review: PASS/);
  assert.deepEqual(Object.keys(v.plan.buckets).sort(), ['frontend-architecture', 'typescript-expert']);
  mustGit(repo, 'add', '-A');
  mustGit(repo, 'commit', '-qm', 'a');
  const approved = readFileSync(join(repo, '.git/pr-self-review/approved'), 'utf8').trim().split('\n');
  assert.match(approved.at(-1), new RegExp(` ${mustGit(repo, 'rev-parse', 'HEAD')} review$`));
  mustGit(repo, 'push', '-q', '-u', 'origin', 'feat');

  write(repo, 'client/src/lib/a.ts', 'export const a = 2;\n');
  mustGit(repo, 'add', '-A');
  const r = git(repo, 'commit', '-qm', 'a2');
  assert.notEqual(r.status, 0);
  assert.match(r.err, /not reviewed/);
  assert.match(r.err, /client\/src\/lib\/a\.ts/);
});

test('BLOCKED verdict blocks the commit and lists the CRITICAL', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  const v = review(repo, critical('client/src/lib/a.ts'));
  assert.equal(v.status, 1);
  assert.match(v.out, /BLOCKED/);
  mustGit(repo, 'add', '-A');
  const r = git(repo, 'commit', '-qm', 'a');
  assert.notEqual(r.status, 0);
  assert.match(r.err, /BLOCKED/);
  assert.match(r.err, /client\/src\/lib\/a\.ts:1 — feature imports another feature/);
});

test('a CRITICAL without path:line evidence is rejected, nothing recorded', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  const v = review(repo, { 'frontend-architecture': [{ file: 'client/src/lib/a.ts', severity: 'CRITICAL', title: 'x' }] });
  assert.equal(v.status, 2);
  assert.match(v.err, /CRITICAL needs/);
  assert.equal(existsSync(join(repo, '.git/pr-self-review/result.json')), false);
});

test('verdict refuses when files changed after collect', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  const v = review(repo, {}, { between: () => write(repo, 'client/src/lib/a.ts', 'export const a = 9;\n') });
  assert.equal(v.status, 2);
  assert.match(v.err, /files changed after collect/);
});

test('partially staged content that differs from the reviewed content is blocked', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  mustGit(repo, 'add', '-A');
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\nexport const b = 2;\n');
  assert.equal(review(repo).status, 0); // reviewed the working copy, index still holds the older content
  const r = git(repo, 'commit', '-qm', 'a');
  assert.notEqual(r.status, 0);
  assert.match(r.err, /not reviewed/);
});

test('--no-verify commit is caught by pre-push; reset --soft + review fixes it', () => {
  const repo = makeRepo();
  write(repo, 'server/src/modules/x/service.ts', 'export const x = 1;\n');
  mustGit(repo, 'add', '-A');
  mustGit(repo, 'commit', '-qm', 'sneaky', '--no-verify');
  const p = git(repo, 'push', '-q', '-u', 'origin', 'feat');
  assert.notEqual(p.status, 0);
  assert.match(p.err, /not approved/);
  assert.match(p.err, /git reset --soft [0-9a-f]{12}~1/);

  mustGit(repo, 'reset', '-q', '--soft', 'HEAD~1');
  assert.equal(review(repo).status, 0);
  mustGit(repo, 'commit', '-qm', 'reviewed');
  mustGit(repo, 'push', '-q', '-u', 'origin', 'feat');
});

test('rebase keeps approval (patch-id), amend without changes too', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  assert.equal(review(repo).status, 0);
  mustGit(repo, 'add', '-A');
  mustGit(repo, 'commit', '-qm', 'a');
  mustGit(repo, 'commit', '-q', '--amend', '-m', 'a (renamed)');

  mustGit(repo, 'checkout', '-q', 'main');
  write(repo, 'README.md', '# t\nmore\n');
  mustGit(repo, 'commit', '-qam', 'docs');
  mustGit(repo, 'push', '-q', 'origin', 'main');
  mustGit(repo, 'checkout', '-q', 'feat');
  mustGit(repo, 'rebase', '-q', 'main');
  mustGit(repo, 'push', '-q', '-u', 'origin', 'feat');
});

test('PR_SELF_REVIEW_SKIP lets a human commit (logged) but the commit is never approved', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  mustGit(repo, 'add', '-A');
  const c = run('git', ['commit', '-qm', 'hotfix'], repo, { PR_SELF_REVIEW_SKIP: '1' });
  assert.equal(c.status, 0, c.err);
  assert.match(c.err, /SKIPPED/);
  assert.match(readFileSync(join(repo, '.git/pr-self-review/skipped.log'), 'utf8'), /commit/);
  assert.notEqual(git(repo, 'push', '-q', '-u', 'origin', 'feat').status, 0);
});

test('approve-existing approves commits made before the hooks (logged)', () => {
  const repo = makeRepo();
  write(repo, 'client/src/lib/a.ts', 'export const a = 1;\n');
  mustGit(repo, 'add', '-A');
  mustGit(repo, 'commit', '-qm', 'old', '--no-verify');
  const a = run(process.execPath, [script(repo, 'check.mjs'), 'approve-existing'], repo);
  assert.equal(a.status, 0, a.err);
  assert.match(a.err, /approved 1 existing commit/);
  mustGit(repo, 'push', '-q', '-u', 'origin', 'feat');
});

test('empty working tree → empty PASS marker', () => {
  const repo = makeRepo();
  const v = review(repo);
  assert.equal(v.status, 0, v.err);
  assert.equal(JSON.parse(readFileSync(join(repo, '.git/pr-self-review/result.json'), 'utf8')).verdict, 'PASS');
});

test('typecheck is deterministic: a type error blocks even when reviewers found nothing', { skip: !existsSync(join(SRC_ROOT, 'client/node_modules/.bin/tsc')) && 'client deps not installed' }, () => {
  const repo = makeRepo();
  write(repo, 'client/tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, noUncheckedIndexedAccess: true, skipLibCheck: true }, include: ['src'] }));
  mkdirSync(join(repo, 'client/node_modules/.bin'), { recursive: true });
  cpSync(join(SRC_ROOT, 'client/node_modules/typescript'), join(repo, 'client/node_modules/typescript'), { recursive: true, dereference: true });
  writeFileSync(join(repo, 'client/node_modules/.bin/tsc'), '#!/bin/sh\nexec node "$(dirname "$0")/../typescript/bin/tsc" "$@"\n', { mode: 0o755 });
  write(repo, '.gitignore', 'node_modules/\n');
  write(repo, 'client/src/lib/tabs.ts', 'export const TABS = [{ icon: "Settings" }];\nexport const ICON: string = TABS[0].icon;\n');
  const v = review(repo);
  assert.equal(v.status, 1, v.out + v.err);
  assert.match(v.out, /Checks: typecheck client: 1 error/);
  assert.match(v.out, /client\/src\/lib\/tabs\.ts:2 — TS2532/);

  write(repo, 'client/src/lib/tabs.ts', 'export const TABS = [{ icon: "Settings" }];\nexport const ICON: string = TABS[0]?.icon ?? "Settings";\n');
  const fixed = review(repo);
  assert.equal(fixed.status, 0, fixed.out + fixed.err);
  assert.match(fixed.out, /typecheck client: ok/);
});
