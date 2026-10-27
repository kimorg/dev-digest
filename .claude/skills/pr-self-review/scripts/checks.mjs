// Deterministic checks verdict.mjs runs on top of the LLM review: they need no judgement, so they
// are not left to the agent. Binaries are called directly — never `pnpm exec`, which may try to
// install deps and, through a symlinked node_modules, write into another checkout.
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  git, headSha, typecheckTargets, parseTscOutput, depcruiseTargets, extractJsBlock, newViolations, importLine,
  violationFinding, ENFORCEMENT_MD,
} from './lib.mjs';

const notRun = (file, what, reason) => ({
  skill: what,
  file,
  line: null,
  severity: 'WARNING',
  title: `${what} not run: ${reason}`,
  rule: null,
  evidence: null,
  fix: null,
});

/**
 * `tsc --noEmit` in one package — src + test where `tsconfig.test.json` exists (server, reviewer-core;
 * their `tsconfig.json` covers src/ only). Any error is CRITICAL: the packages typecheck clean at HEAD.
 */
export function runTypecheck(pkg, root) {
  const dir = join(root, pkg);
  const tsc = join(dir, 'node_modules', '.bin', 'tsc');
  if (!existsSync(join(dir, 'tsconfig.json'))) return { note: `typecheck ${pkg}: skipped (no tsconfig.json)`, findings: [] };
  const project = existsSync(join(dir, 'tsconfig.test.json')) ? 'tsconfig.test.json' : 'tsconfig.json';
  if (!existsSync(tsc)) {
    return { note: `typecheck ${pkg}: NOT RUN`, findings: [notRun(`${pkg}/${project}`, 'typecheck', `${pkg}/node_modules/.bin/tsc missing — install ${pkg} deps`)] };
  }
  try {
    execFileSync(tsc, ['--noEmit', '-p', project], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    return { note: `typecheck ${pkg}: ok`, findings: [] };
  } catch (e) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    const findings = parseTscOutput(out, pkg);
    if (findings.length) return { note: `typecheck ${pkg}: ${findings.length} error(s)`, findings };
    return { note: `typecheck ${pkg}: NOT RUN`, findings: [notRun(`${pkg}/${project}`, 'typecheck', `tsc failed without diagnostics: ${out.trim().slice(0, 200)}`)] };
  }
}

function depcruiseJson(bin, cwd, src, config) {
  const r = spawnSync(bin, [src, '--config', config, '--output-type', 'json'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  try {
    return JSON.parse(r.stdout).summary.violations;
  } catch {
    throw new Error(`depcruise produced no JSON in ${cwd}: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`);
  }
}

/** New dependency-rule violations vs a baseline built from HEAD in a throwaway worktree. */
export function runDepcruise(files, root) {
  const targets = depcruiseTargets(files);
  if (!targets.length) return { notes: [], findings: [] };
  const bin = join(root, 'server', 'node_modules', '.bin', 'depcruise');
  const fail = (reason) => ({
    notes: targets.map((t) => `depcruise ${t.name}: NOT RUN`),
    findings: targets.map((t) => notRun(`${t.cwd}/${t.src}`.replace('server/../', ''), 'dependency-cruiser', reason)),
  });
  if (!existsSync(bin)) return fail('server/node_modules/.bin/depcruise missing — install server deps');
  if (!headSha(root)) return fail('no HEAD commit to build a baseline from');
  const mdPath = join(root, ENFORCEMENT_MD);
  if (!existsSync(mdPath)) return fail(`${ENFORCEMENT_MD} not found`);
  const md = readFileSync(mdPath, 'utf8');

  const tmp = mkdtempSync(join(tmpdir(), 'psr-depcruise-'));
  const base = join(tmp, 'base');
  try {
    git(['worktree', 'add', '--detach', '-q', base, 'HEAD'], { root });
    for (const pkg of ['server', 'reviewer-core']) {
      const nm = join(root, pkg, 'node_modules');
      if (existsSync(nm) && existsSync(join(base, pkg))) symlinkSync(nm, join(base, pkg, 'node_modules'));
    }
    const changed = files.map((f) => f.path);
    const notes = [];
    const findings = [];
    for (const t of targets) {
      const code = extractJsBlock(md, t.heading);
      if (!code) {
        notes.push(`depcruise ${t.name}: NOT RUN`);
        findings.push(notRun(t.include[0], 'dependency-cruiser', `no js config block under "## ${t.heading}" in ${ENFORCEMENT_MD}`));
        continue;
      }
      const config = join(tmp, `${t.name}.cjs`);
      writeFileSync(config, code);
      const baseline = depcruiseJson(bin, join(base, t.cwd), t.src, config);
      const current = depcruiseJson(bin, join(root, t.cwd), t.src, config);
      const fresh = newViolations({ baseline, current, cwd: t.cwd, changed });
      for (const v of fresh) {
        const text = existsSync(join(root, v.file)) ? readFileSync(join(root, v.file), 'utf8') : '';
        findings.push(violationFinding(v, importLine(text, v.unresolvedTo ?? v.to)));
      }
      notes.push(`depcruise ${t.name}: ${fresh.length} new violation(s) (baseline ${baseline.length})`);
    }
    return { notes, findings };
  } catch (e) {
    return fail(e.message.split('\n')[0]);
  } finally {
    git(['worktree', 'remove', '--force', base], { root, allowFail: true });
    git(['worktree', 'prune'], { root, allowFail: true });
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** All deterministic checks for the plan's files. */
export function runChecks(plan, root) {
  const notes = [];
  const findings = [];
  for (const pkg of typecheckTargets(plan.files)) {
    const r = runTypecheck(pkg, root);
    notes.push(r.note);
    findings.push(...r.findings);
  }
  const dc = runDepcruise(plan.files, root);
  notes.push(...dc.notes);
  findings.push(...dc.findings);
  return { notes, findings };
}
