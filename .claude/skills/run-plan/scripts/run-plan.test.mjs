// Run: node --test .claude/skills/run-plan/scripts/run-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlan, checkSpec, diffSnapshots, decideReviewers, classify, isTestPath } from './run-plan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, 'run-plan.mjs');

const SPEC = `# Spec: Ping badge
Spec ID: SPEC-006
Status: approved
Modules: server, client

## Acceptance criteria (EARS)
- AC-1 (Event-driven): When the client requests GET /ping, the API shall return 200 with { ok: true }.
- AC-2 (Unwanted behaviour): If the database is unreachable, then the API shall return 503.
`;

const plan = ({ status = 'READY', mode = 'single-agent', spec = 'specs/006-ping-badge.md', steps, tests = true, security = 'none', ws = '' } = {}) => `# Development Plan: Ping badge
Status: ${status} · Packages: server, client · Spec: ${spec}
Execution mode: ${mode}

## Requirements check
| ID | Requirement | Status | Proof | Evidence |
|---|---|---|---|---|
| AC-1 | GET /ping | OK | test (T-1) | — |

## Steps
### S1 — route
- Files: ${steps ?? '`server/src/modules/ping/routes.ts` (create), `server/src/adapters/mocks.ts` (modify)'}
- Done when: route registered
- Verify: \`cd server && pnpm typecheck\`

${tests ? `## Tests (test-writer)
| T | Proves | Pattern → shape | Seam | Kind | File | Observable · fakes | Needs |
|---|---|---|---|---|---|---|---|
| T-1 | AC-1 | Event → arrange/act/assert | \`GET /ping\` | it | \`server/test/ping.it.test.ts\` (create) | 200 body | — |
| T-2 | AC-2 | Unwanted → negative | \`GET /ping\` | it | \`server/test/ping.it.test.ts\` (create) | 503 | S1 (mocks) |

### Existing tests affected
| Test file | Why | Change |
|---|---|---|
| \`server/test/contracts.test.ts\` | new field | compile (implementer, S1) |
| \`client/src/a/A.test.tsx\` | copy | assertion (test-writer, T-3) |
| \`server/test/skills.it.test.ts:210,214\` | not broken | — |
` : '## Tests\n| file | kind |\n|---|---|\n'}
## Execution mode — choose one
- single-agent
${ws}

## Handoff to reviewers
- Architecture: new module
- Security: ${security}
`;

test('parsePlan: a plan in the run-plan contract', () => {
  const p = parsePlan(plan(), 'docs/plans/006-ping-badge.md');
  assert.deepEqual(p.errors, []);
  assert.equal(p.id, '006');
  assert.equal(p.mode, 'single-agent');
  assert.equal(p.spec, 'specs/006-ping-badge.md');
  assert.deepEqual(p.packages, ['server', 'client']);
  assert.deepEqual(p.tests.map((t) => [t.id, t.file]), [['T-1', 'server/test/ping.it.test.ts'], ['T-2', 'server/test/ping.it.test.ts']]);
  assert.deepEqual(p.affected.map((a) => [a.file, a.change]), [
    ['server/test/contracts.test.ts', 'compile'], ['client/src/a/A.test.tsx', 'assertion'], ['server/test/skills.it.test.ts', 'unknown'],
  ]);
  assert.match(p.warnings.join(), /skills\.it\.test\.ts is neither compile nor assertion/);
  assert.equal(p.securityNone, true);
});

test('parsePlan: gates', () => {
  assert.match(parsePlan(plan({ status: 'NEEDS_CLARIFICATION' }), 'docs/plans/006-x.md').errors.join(), /expected READY/);
  assert.match(parsePlan(plan({ tests: false }), 'docs/plans/006-x.md').errors.join(), /predates the run-plan contract/);
  assert.match(parsePlan(plan({ steps: '`server/src/a.ts`, `server/test/a.test.ts`' }), 'docs/plans/006-x.md').errors.join(), /Steps list test files/);
  assert.match(parsePlan(plan({ mode: 'multi-agent' }), 'docs/plans/006-x.md').errors.join(), /no workstream rows/);
  assert.match(parsePlan(plan({ mode: 'AWAITING USER CHOICE — recommended: single-agent' }), 'docs/plans/006-x.md').warnings.join(), /ask the user/);
  assert.match(parsePlan(plan(), 'docs/plans/ping.md').errors.join(), /not NNN-<slug>\.md/);
  const ws = '| Workstream | Agent | Steps | Package | Depends | Parallel |\n|---|---|---|---|---|---|\n| W1 | implementer | S1 | server | — | — |\n| W2 | test-writer | T-1–T-2 | server | W1 | — |';
  const m = parsePlan(plan({ mode: 'multi-agent', ws }), 'docs/plans/006-x.md');
  assert.deepEqual(m.errors, []);
  assert.deepEqual(m.workstreams.map((w) => [w.id, w.agent]), [['W1', 'implementer'], ['W2', 'test-writer']]);
});

test('checkSpec: approved with ACs passes; draft / no ACs / missing fail', () => {
  const root = mkdtempSync(join(tmpdir(), 'rp-spec-'));
  mkdirSync(join(root, 'specs'));
  writeFileSync(join(root, 'specs/006-a.md'), SPEC);
  writeFileSync(join(root, 'specs/007-b.md'), SPEC.replace('approved', 'draft'));
  writeFileSync(join(root, 'specs/008-c.md'), 'Status: approved\n');
  assert.deepEqual(checkSpec('specs/006-a.md', root).acceptanceCriteria, ['AC-1', 'AC-2']);
  assert.equal(checkSpec('specs/007-b.md', root).ok, false);
  assert.match(checkSpec('specs/008-c.md', root).errors.join(), /no EARS/);
  assert.equal(checkSpec('specs/404.md', root).ok, false);
  assert.equal(checkSpec('inline', root).ok, true);
  rmSync(root, { recursive: true, force: true });
});

test('diffSnapshots: new, modified, reverted; untouched baseline-dirty files are not changes', () => {
  const base = { 'a.md': 'h1', 'b.ts': 'h2', 'c.ts': 'h3' };
  const now = { 'a.md': 'h1', 'b.ts': 'h2x', 'd.ts': 'h4' };
  assert.deepEqual(diffSnapshots(base, now, { 'b.ts': 'M', 'd.ts': '?' }), [
    { path: 'b.ts', change: 'modified' }, { path: 'c.ts', change: 'reverted' }, { path: 'd.ts', change: 'new' },
  ]);
  assert.deepEqual(diffSnapshots({}, { 'x.ts': 'D' }, { 'x.ts': 'D' }), [{ path: 'x.ts', change: 'deleted' }]);
});

test('classify / isTestPath agree with the guards', () => {
  assert.equal(classify('server/src/modules/ping/routes.ts').kind, 'source');
  assert.equal(classify('server/test/ping.it.test.ts').kind, 'test');
  assert.equal(classify('client/src/app/x/A.test.tsx').kind, 'test');
  assert.equal(classify('e2e/specs/03-x.flow.json').kind, 'test');
  assert.equal(classify('docs/plans/006-x.md').package, 'root');
  assert.equal(isTestPath('server/src/adapters/mocks.ts'), false);
});

test('decideReviewers: architecture on source; security by plan line, paths and flag', () => {
  const f = (path, change = 'new') => ({ ...classify(path), change });
  const quiet = { securityNone: true, securityLine: 'none' };
  const onlyTests = decideReviewers([f('server/test/a.test.ts')], quiet);
  assert.equal(onlyTests.architecture.run, false);
  assert.equal(onlyTests.security.run, false);
  const ui = decideReviewers([f('client/src/app/x/_components/A/A.tsx')], quiet);
  assert.equal(ui.architecture.run, true);
  assert.equal(ui.security.run, false);
  assert.equal(decideReviewers([f('server/src/modules/ping/routes.ts')], quiet).security.run, true);
  assert.equal(decideReviewers([f('reviewer-core/src/prompt.ts')], quiet).security.run, true);
  assert.equal(decideReviewers([f('client/src/a.tsx')], { securityNone: false, securityLine: 'renders PR title' }).security.run, true);
  assert.equal(decideReviewers([f('server/src/modules/ping/routes.ts')], quiet, 'off').security.run, false);
  assert.equal(decideReviewers([f('docs/x.md')], quiet, 'on').security.run, true);
  assert.equal(decideReviewers([f('server/src/modules/ping/routes.ts', 'reverted')], quiet).architecture.run, false);
});

// ---------- CLI against a real git repo ----------

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'rp-cli-'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  mkdirSync(join(root, 'specs'));
  mkdirSync(join(root, 'server/src/modules/ping'), { recursive: true });
  writeFileSync(join(root, 'specs/006-ping-badge.md'), SPEC);
  writeFileSync(join(root, 'docs/plans/006-ping-badge.md'), plan());
  writeFileSync(join(root, 'README.md'), 'x\n');
  writeFileSync(join(root, 'server/src/adapters.ts'), 'export {}\n');
  git('add', '.'); git('commit', '-qm', 'init');
  return { root, git };
}
const rp = (root, ...args) => {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
  return { code: r.status, json: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr };
};

test('CLI: start → changed → checkpoint → changed --since → reviewers → stage → handoff', () => {
  const { root } = repo();
  writeFileSync(join(root, 'README.md'), 'dirty before the run\n'); // pre-run dirty, untouched by the run
  writeFileSync(join(root, 'notes.txt'), 'untracked before the run\n');
  const s = rp(root, 'start', 'docs/plans/006-ping-badge.md');
  assert.equal(s.code, 0, JSON.stringify(s.json));
  assert.equal(s.json.baseline.dirtyFiles, 2);
  assert.ok(s.json.warnings.some((w) => /server\/node_modules missing/.test(w)), JSON.stringify(s.json.warnings));
  assert.match(s.json.reportPath, /run-plan\/006\/report\.md$/);

  assert.deepEqual(rp(root, 'changed', '006').json.files, []);

  writeFileSync(join(root, 'server/src/modules/ping/routes.ts'), 'export const r = 1;\n');
  writeFileSync(join(root, 'server/src/adapters.ts'), 'export const a = 1;\n');
  const c1 = rp(root, 'changed', '006').json;
  assert.deepEqual(c1.files.map((f) => [f.path, f.change, f.kind]), [
    ['server/src/adapters.ts', 'modified', 'source'], ['server/src/modules/ping/routes.ts', 'new', 'source'],
  ]);

  const rv = rp(root, 'reviewers', '006').json;
  assert.equal(rv.architecture.run, true);
  assert.equal(rv.security.run, true); // routes.ts
  assert.ok(rv.security.reasons.some((r) => /HTTP route/.test(r)));

  assert.equal(rp(root, 'checkpoint', '006', 'round-1').code, 0);
  mkdirSync(join(root, 'server/test'));
  writeFileSync(join(root, 'server/test/ping.it.test.ts'), 'test\n');
  const c2 = rp(root, 'changed', '006', '--since', 'round-1').json;
  assert.deepEqual(c2.files.map((f) => [f.path, f.kind]), [['server/test/ping.it.test.ts', 'test']]);

  writeFileSync(join(root, 'README.md'), 'changed during the run\n');
  assert.match(rp(root, 'changed', '006').json.warnings.join(), /pre-run dirty files changed during the run: README\.md/);

  assert.equal(rp(root, 'stage', '006', 'implement', 'ok', '--note', 'S1 done').code, 0);
  const st = rp(root, 'status', '006').json;
  assert.deepEqual(st.stages.map((x) => x.name), ['implement']);
  assert.deepEqual(st.checkpoints, ['round-1']);

  const h = rp(root, 'handoff', '006').json;
  assert.equal(h.agent, 'plan-verifier');
  assert.ok(h.files.includes('server/test/ping.it.test.ts'));
  assert.ok(!h.files.includes('notes.txt'));
  assert.match(h.prompt, /Verify docs\/plans\/006-ping-badge\.md \(spec: specs\/006-ping-badge\.md\)/);
  rmSync(root, { recursive: true, force: true });
});

test('CLI: start refuses a second run without --force, and a draft spec', () => {
  const { root } = repo();
  assert.equal(rp(root, 'start', 'docs/plans/006-ping-badge.md').code, 0);
  const again = rp(root, 'start', 'docs/plans/006-ping-badge.md');
  assert.equal(again.code, 1);
  assert.equal(again.json.resumable, true);
  assert.equal(rp(root, 'start', 'docs/plans/006-ping-badge.md', '--force').code, 0);

  writeFileSync(join(root, 'specs/006-ping-badge.md'), SPEC.replace('approved', 'draft'));
  const draft = rp(root, 'start', 'docs/plans/006-ping-badge.md', '--force');
  assert.equal(draft.code, 1);
  assert.match(draft.json.errors.join(), /spec Status is draft/);
  assert.equal(rp(root, 'start', 'docs/plans/404-none.md').code, 1);
  assert.equal(rp(root, 'changed', '999').code, 1);
  assert.equal(rp(root, 'bogus').code, 2);
  rmSync(root, { recursive: true, force: true });
});

test('CLI: state lives in the per-worktree git dir', () => {
  const { root, git } = repo();
  const wtParent = mkdtempSync(join(tmpdir(), 'rp-wt-'));
  const wt = join(wtParent, 'wt');
  git('worktree', 'add', '-q', '--detach', wt);
  const s = rp(wt, 'start', 'docs/plans/006-ping-badge.md');
  assert.equal(s.code, 0, JSON.stringify(s.json));
  assert.match(s.json.reportPath, /\.git\/worktrees\/wt\/run-plan\/006\/report\.md$/);
  assert.equal(rp(root, 'status', '006').code, 1); // the main checkout has no run
  git('worktree', 'remove', '--force', wt);
  rmSync(root, { recursive: true, force: true });
  rmSync(wtParent, { recursive: true, force: true });
});

test('CLI: checks reports NOT RUN (no node_modules) without failing the gate', () => {
  const { root } = repo();
  rp(root, 'start', 'docs/plans/006-ping-badge.md');
  writeFileSync(join(root, 'server/src/modules/ping/routes.ts'), 'export const r = 1;\n');
  writeFileSync(join(root, 'server/tsconfig.json'), '{}');
  const c = rp(root, 'checks', '006');
  assert.equal(c.code, 0, JSON.stringify(c.json));
  assert.ok(c.json.notes.some((n) => /typecheck server: NOT RUN/.test(n)));
  rmSync(root, { recursive: true, force: true });
});
