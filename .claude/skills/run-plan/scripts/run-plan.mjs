#!/usr/bin/env node
// Deterministic half of the /run-plan skill: everything that needs no judgement, so the main thread
// does not improvise it. Prints one JSON document per call on stdout; exit 0 = ok, 1 = gate failed
// (the JSON says why), 2 = usage error.
//
//   start <plan.md> [--force]            preflight gates + baseline snapshot → state in <git-dir>/run-plan/<NNN>/
//   checkpoint <NNN> <label>             snapshot the working tree (before a fix round)
//   changed <NNN> [--since <label>]      files this run changed (baseline-dirty files only if their content changed)
//   checks <NNN> [--since <label>]       typecheck + new dependency-cruiser violations of the changed files
//   reviewers <NNN> [--since <label>] [--security auto|on|off]   which reviewers to start, and why
//   stage <NNN> <name> <status> [--note <text>]                  append to the run log (resume after compaction)
//   status <NNN>                         state + stages so far
//   handoff <NNN>                        the manual plan-verifier hand-off
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitDir, headSha, workingChanges, hashWorkingFiles, DELETED, repoRoot } from '../../pr-self-review/scripts/lib.mjs';
import { runChecks } from '../../pr-self-review/scripts/checks.mjs';

export const PACKAGES = ['server', 'client', 'reviewer-core', 'mcp', 'e2e'];

// Same set as implementer-guard.mjs TEST_PATH and the test-writer allowlist in agent-guard.mjs.
export const TEST_PATH = [
  /^(?:server|client|reviewer-core|mcp)\/.*\.test\.tsx?$/,
  /^server\/test\//,
  /^client\/src\/test\//,
  /^reviewer-core\/test\//,
  /^mcp\/test\//,
  /^e2e\/specs\/.*\.flow\.json$/,
];
export const isTestPath = (p) => TEST_PATH.some((re) => re.test(p));
const SOURCE = /^(?:server|client|reviewer-core|mcp)\/src\/.+\.(?:ts|tsx|mts)$/;
const isDoc = (p) => p.endsWith('.md');

// Paths whose change makes a security review worthwhile even when the plan says "none".
export const SECURITY_PATHS = [
  [/^server\/src\/modules\/[^/]+\/routes\.ts$/, 'HTTP route'],
  [/^server\/src\/adapters\//, 'adapter (git / GitHub / LLM / secrets)'],
  [/^server\/src\/platform\//, 'platform wiring'],
  [/(?:^|\/)[^/]*(?:clone|git|secret|auth|token|prompt|exec|spawn|shell|upload)[^/]*\.(?:ts|tsx)$/i, 'sensitive name'],
  [/^reviewer-core\/src\//, 'review engine (prompt assembly / untrusted diff text)'],
  [/^mcp\/src\//, 'MCP tool surface'],
  [/(?:^|\/)package\.json$/, 'dependency change'],
];

const die = (code, doc) => {
  process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  process.exit(code);
};

// ---------- plan parsing ----------

/** Lines of the `## <heading>` section (until the next `## `). */
export function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
// `path`, `path:12`, `path:45-50`, `path:210,214` → path
const pathsIn = (text) => [...text.matchAll(/`([^`\s]+\/[^`\s]+?)`/g)].map((m) => m[1].replace(/:[\d,-]+$/, '').replace(/[),.;]+$/, ''));

export function parsePlan(md, planPath) {
  const header = md.split('\n').slice(0, 12).join('\n');
  const status = header.match(/^Status:\s*([A-Z_]+)/m)?.[1] ?? null;
  const packages = (header.match(/Packages:\s*([^·\n]+)/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const spec = header.match(/Spec:\s*`?([^\s`·]+)`?/)?.[1] ?? null;
  const modeRaw = header.match(/^Execution mode:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const mode = /^single-agent\b/.test(modeRaw ?? '') ? 'single-agent' : /^multi-agent\b/.test(modeRaw ?? '') ? 'multi-agent' : null;

  const steps = section(md, 'Steps') ?? [];
  const stepFiles = steps.filter((l) => /^- Files:/.test(l.trim())).flatMap((l) => pathsIn(l));
  const testsSec = section(md, 'Tests (test-writer)');
  const tests = [];
  const affected = [];
  if (testsSec) {
    let inAffected = false;
    for (const l of testsSec) {
      if (/^###\s+Existing tests affected/i.test(l)) { inAffected = true; continue; }
      if (!l.trim().startsWith('|')) continue;
      const c = cells(l);
      if (!inAffected && /^T-\d+$/.test(c[0])) tests.push({ id: c[0], proves: c[1], kind: c[4], file: pathsIn(c[5] ?? '')[0] ?? c[5], needs: c[7] ?? '' });
      if (inAffected && pathsIn(c[0]).length) affected.push({ file: pathsIn(c[0])[0], why: c[1], change: /assertion/i.test(c[2] ?? '') ? 'assertion' : /compile/i.test(c[2] ?? '') ? 'compile' : 'unknown' });
    }
  }
  const handoff = section(md, 'Handoff to reviewers') ?? [];
  const securityLine = handoff.find((l) => /^-\s*Security:/.test(l.trim()))?.replace(/^\s*-\s*Security:\s*/, '').trim() ?? null;
  const securityNone = securityLine !== null && /^`?none`?\.?$/i.test(securityLine);

  const workstreams = [];
  const modeSec = section(md, 'Execution mode') ?? [];
  for (const l of modeSec) {
    const c = l.trim().startsWith('|') ? cells(l) : [];
    if (/^W\d+$/.test(c[0] ?? '')) workstreams.push({ id: c[0], agent: c[1], items: c[2], package: c[3], dependsOn: c[4], parallelWith: c[5] });
  }

  const errors = [];
  const warnings = [];
  if (status !== 'READY') errors.push(`plan Status is ${status ?? 'missing'}, expected READY`);
  if (!testsSec) errors.push('plan has no "## Tests (test-writer)" section — it predates the run-plan contract; re-run implementation-planner');
  const testInSteps = stepFiles.filter(isTestPath);
  if (testInSteps.length) errors.push(`Steps list test files (${testInSteps.join(', ')}) — new tests belong in the Tests table; re-run implementation-planner`);
  if (testsSec && !tests.length) warnings.push('Tests table has no T-n rows');
  if (!mode) warnings.push(`Execution mode is "${modeRaw ?? 'missing'}" — ask the user: single-agent or multi-agent`);
  if (mode === 'multi-agent' && !workstreams.length) errors.push('multi-agent mode but no workstream rows (| W1 | …) in "Execution mode"');
  for (const x of affected.filter((r) => r.change === 'unknown')) warnings.push(`"Existing tests affected" row ${x.file} is neither compile nor assertion — treated as not broken; the implementer must not edit it`);
  if (securityLine === null) warnings.push('no "Security:" line in Handoff to reviewers — security-reviewer decided by paths only');

  const m = basename(planPath).match(/^(\d{3})-([a-z0-9-]+)\.md$/);
  if (!m) errors.push(`plan file name "${basename(planPath)}" is not NNN-<slug>.md`);
  return {
    id: m?.[1] ?? null, slug: m?.[2] ?? null, path: planPath, status, packages, spec, mode, modeRaw,
    stepFiles, tests, affected, workstreams, securityLine, securityNone, errors, warnings,
  };
}

export function checkSpec(specPath, root) {
  if (!specPath || specPath === 'inline') return { ok: true, warnings: ['spec is inline — test-writer gets the plan\'s Requirements check as its oracle'] };
  const abs = join(root, specPath);
  if (!existsSync(abs)) return { ok: false, errors: [`spec ${specPath} not found`] };
  const md = readFileSync(abs, 'utf8');
  const st = md.match(/^Status:\s*(\w+)/m)?.[1] ?? null;
  const acs = [...md.matchAll(/^\s*-\s*(AC-\d+)\s*\(/gm)].map((x) => x[1]);
  const errors = [];
  const warnings = [];
  if (st !== 'approved') (st === 'implemented' ? warnings : errors).push(`spec Status is ${st ?? 'missing'}, expected approved`);
  if (!acs.length) errors.push('spec has no EARS acceptance criteria (AC-n (Pattern))');
  return { ok: !errors.length, status: st, acceptanceCriteria: acs, errors, warnings };
}

// ---------- state ----------

const stateDirFor = (root, id) => join(gitDir(root), 'run-plan', id);
const statePath = (root, id) => join(stateDirFor(root, id), 'state.json');
function readState(root, id) {
  const p = statePath(root, id);
  if (!existsSync(p)) die(1, { ok: false, errors: [`no run state for plan ${id} — run "start <plan.md>" first`] });
  return JSON.parse(readFileSync(p, 'utf8'));
}
const writeState = (root, state) => {
  mkdirSync(stateDirFor(root, state.plan.id), { recursive: true });
  writeFileSync(statePath(root, state.plan.id), JSON.stringify(state, null, 2) + '\n');
};

const snapshot = (root) => Object.fromEntries(workingChanges(root).map((c) => [c.path, c.hash]));
const GIT_STATUS = { '?': 'new', A: 'new', D: 'deleted' };

/**
 * Paths whose content differs from `ref` (a {path: hash} map of dirty files at that moment).
 * `change` is the file's state vs HEAD — new (untracked / added), deleted, modified — or `reverted`
 * (dirty at `ref`, clean now). Reviewers read `new` files whole and `git diff HEAD` the others.
 */
export function diffSnapshots(ref, now, statusOf = {}) {
  const out = [];
  for (const [p, h] of Object.entries(now)) if (ref[p] !== h) out.push({ path: p, change: GIT_STATUS[statusOf[p]] ?? 'modified' });
  // A file dirty at the reference point but clean now was reverted to HEAD — also a change.
  for (const p of Object.keys(ref)) if (!(p in now)) out.push({ path: p, change: 'reverted' });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function classify(path) {
  const pkg = PACKAGES.find((p) => path.startsWith(`${p}/`)) ?? 'root';
  const kind = isTestPath(path) ? 'test' : isDoc(path) ? 'doc' : SOURCE.test(path) ? 'source' : 'other';
  return { path, package: pkg, kind };
}

function changedSince(root, state, label) {
  const ref = label ? state.checkpoints?.[label] : state.baseline.dirty;
  if (!ref) die(1, { ok: false, errors: [`no checkpoint "${label}"`] });
  const changes = workingChanges(root);
  const now = Object.fromEntries(changes.map((c) => [c.path, c.hash]));
  const statusOf = Object.fromEntries(changes.map((c) => [c.path, c.status]));
  const head = headSha(root);
  const files = diffSnapshots(ref, now, statusOf).map((c) => ({ ...c, ...classify(c.path) }));
  const baselineTouched = label ? [] : files.filter((f) => f.path in state.baseline.dirty).map((f) => f.path);
  return { head, headMoved: head !== state.baseline.head, files, baselineTouched };
}

// ---------- reviewers ----------

export function decideReviewers(files, { securityNone, securityLine }, flag = 'auto') {
  const src = files.filter((f) => f.kind === 'source' && f.change !== 'reverted');
  const architecture = { run: src.some((f) => f.package !== 'e2e'), reasons: src.length ? [`${src.length} production source file(s) changed`] : ['no production source changed'] };
  const reasons = [];
  if (flag === 'on') reasons.push('--security on');
  if (securityLine && !securityNone) reasons.push(`plan: Security: ${securityLine.slice(0, 120)}`);
  for (const f of files) {
    if (f.change === 'reverted') continue;
    const hit = SECURITY_PATHS.find(([re]) => re.test(f.path));
    if (hit) reasons.push(`${f.path} — ${hit[1]}`);
  }
  const run = flag === 'on' || (flag === 'auto' && reasons.length > 0);
  return { architecture, security: { run, flag, reasons: flag === 'off' ? ['--security off'] : reasons.length ? [...new Set(reasons)] : ['plan says none and no sensitive path changed'] } };
}

// ---------- CLI ----------

function opt(argv, name, def = null) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : argv[i + 1];
}

function main(argv) {
  const [cmd, a1, a2, a3] = argv;
  const root = repoRoot();
  switch (cmd) {
    case 'start': {
      if (!a1) die(2, { ok: false, errors: ['usage: start <docs/plans/NNN-slug.md> [--force]'] });
      const abs = join(root, a1);
      if (!existsSync(abs)) die(1, { ok: false, errors: [`plan ${a1} not found`] });
      const plan = parsePlan(readFileSync(abs, 'utf8'), a1);
      const spec = checkSpec(plan.spec, root);
      const errors = [...plan.errors, ...(spec.errors ?? [])];
      const warnings = [...plan.warnings, ...(spec.warnings ?? [])];
      if (plan.id && existsSync(statePath(root, plan.id)) && !argv.includes('--force')) {
        const prev = JSON.parse(readFileSync(statePath(root, plan.id), 'utf8'));
        die(1, { ok: false, resumable: true, errors: [`a run of plan ${plan.id} already exists (started ${prev.startedAt}, last stage: ${prev.stages.at(-1)?.name ?? 'none'}) — resume it with "status ${plan.id}", or restart with --force`], stages: prev.stages });
      }
      if (errors.length) die(1, { ok: false, errors, warnings, plan });
      for (const pkg of plan.packages.map((x) => x.split(/\s/)[0]).filter((x) => PACKAGES.includes(x))) {
        if (!existsSync(join(root, pkg, 'node_modules'))) warnings.push(`${pkg}/node_modules missing — agents' typecheck / tests in ${pkg} will be NOT RUN (install: ${['server', 'client'].includes(pkg) ? 'pnpm install' : 'npm ci'} in ${pkg}/)`);
      }
      const dirty = snapshot(root);
      const planFiles = new Set([...plan.stepFiles, ...plan.tests.map((t) => t.file)]);
      const overlap = Object.keys(dirty).filter((p) => planFiles.has(p));
      if (overlap.length) warnings.push(`files of the plan are already dirty before the run: ${overlap.join(', ')} — reviewers and plan-verifier will see the pre-run edits too`);
      const state = {
        plan: { id: plan.id, slug: plan.slug, path: a1, spec: plan.spec, mode: plan.mode, packages: plan.packages, securityLine: plan.securityLine, securityNone: plan.securityNone },
        startedAt: new Date().toISOString(),
        baseline: { head: headSha(root), dirty },
        checkpoints: {},
        stages: [],
        reportPath: join(stateDirFor(root, plan.id), 'report.md'),
      };
      writeState(root, state);
      die(0, {
        ok: true, warnings, reportPath: state.reportPath,
        plan: { id: plan.id, path: a1, spec: plan.spec, mode: plan.mode, packages: plan.packages, tests: plan.tests.map((t) => t.id), affected: plan.affected, workstreams: plan.workstreams, security: plan.securityLine },
        spec: { status: spec.status, acceptanceCriteria: spec.acceptanceCriteria },
        baseline: { head: state.baseline.head, dirtyFiles: Object.keys(dirty).length },
      });
    }
    case 'checkpoint': {
      const state = readState(root, a1);
      if (!a2) die(2, { ok: false, errors: ['usage: checkpoint <NNN> <label>'] });
      state.checkpoints[a2] = snapshot(root);
      writeState(root, state);
      die(0, { ok: true, checkpoint: a2, dirtyFiles: Object.keys(state.checkpoints[a2]).length });
    }
    case 'changed': {
      const state = readState(root, a1);
      const r = changedSince(root, state, opt(argv, 'since'));
      const warnings = [];
      if (r.headMoved) warnings.push(`HEAD moved since the baseline (${state.baseline.head?.slice(0, 7)} → ${r.head?.slice(0, 7)}) — committed changes are not listed`);
      if (r.baselineTouched.length) warnings.push(`pre-run dirty files changed during the run: ${r.baselineTouched.join(', ')}`);
      die(0, { ok: true, since: opt(argv, 'since') ?? 'baseline', warnings, files: r.files });
    }
    case 'checks': {
      const state = readState(root, a1);
      const r = changedSince(root, state, opt(argv, 'since'));
      const live = r.files.filter((f) => f.change !== 'reverted');
      const hashes = hashWorkingFiles(live.map((f) => f.path), root);
      const res = runChecks({ files: live.map((f) => ({ path: f.path, hash: hashes.get(f.path) ?? DELETED })) }, root);
      const critical = res.findings.filter((f) => f.severity === 'CRITICAL');
      die(critical.length ? 1 : 0, { ok: !critical.length, notes: res.notes, findings: res.findings });
    }
    case 'reviewers': {
      const state = readState(root, a1);
      const r = changedSince(root, state, opt(argv, 'since'));
      const flag = opt(argv, 'security', 'auto');
      if (!['auto', 'on', 'off'].includes(flag)) die(2, { ok: false, errors: ['--security auto|on|off'] });
      die(0, { ok: true, ...decideReviewers(r.files, state.plan, flag), files: r.files.filter((f) => f.change !== 'reverted').map((f) => f.path) });
    }
    case 'stage': {
      const state = readState(root, a1);
      if (!a2 || !a3) die(2, { ok: false, errors: ['usage: stage <NNN> <name> <status> [--note <text>]'] });
      state.stages.push({ name: a2, status: a3, note: opt(argv, 'note'), at: new Date().toISOString() });
      writeState(root, state);
      die(0, { ok: true, stages: state.stages });
    }
    case 'status': {
      const state = readState(root, a1);
      die(0, { ok: true, plan: state.plan, startedAt: state.startedAt, baselineHead: state.baseline.head, checkpoints: Object.keys(state.checkpoints), stages: state.stages, reportPath: state.reportPath });
    }
    case 'handoff': {
      const state = readState(root, a1);
      const r = changedSince(root, state, null);
      const files = r.files.filter((f) => f.change !== 'reverted').map((f) => f.path);
      const prompt = [
        `Verify ${state.plan.path} (spec: ${state.plan.spec ?? 'inline'}).`,
        `Base: ${state.baseline.head} plus the files below — files that were already dirty before the run and did not change are not part of it.`,
        `Run report (Implementation / Test reports, reviews, fix rounds, addenda as extra requirements): ${state.reportPath}`,
        `Files changed by the run:`,
        ...files.map((f) => `- ${f}`),
      ].join('\n');
      die(0, { ok: true, agent: 'plan-verifier', prompt, files });
    }
    default:
      die(2, { ok: false, errors: [`unknown command "${cmd ?? ''}" — start | checkpoint | changed | checks | reviewers | stage | status | handoff`] });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
