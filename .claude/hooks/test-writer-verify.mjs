#!/usr/bin/env node
// SubagentStop check for the `test-writer` subagent (frontmatter `Stop`, auto-converted to SubagentStop).
// Runs the unit/component test files the agent wrote (from its transcript; git status as fallback)
// with that package's vitest, and typechecks every package where a test file changed (including
// `*.it.test.ts` and `test/helpers/`; server and reviewer-core via `tsconfig.test.json`, which adds
// `test/**` to `src/**`). `*.it.test.ts` and e2e flows are not run here — they need Docker / the
// stack; the agent reports them. Failures → exit 2 with the output as the next
// instruction. Loop guards as in implementer-verify: at most MAX_BLOCKS blocks per run, then the
// agent may stop and the user gets a warning; missing deps or unreadable input never block.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const MAX_BLOCKS = 2;
const MAX_OUTPUT_LINES = 40;
const RUN_TIMEOUT_MS = 240_000;
const PACKAGES = ['server', 'client', 'reviewer-core'];
const UNIT_TEST = /\.test\.tsx?$/;
const INTEGRATION_TEST = /\.it\.test\.ts$/;
const TEST_HELPER = /^test\/helpers\//;

const allow = (warning) => {
  if (warning) process.stdout.write(JSON.stringify({ systemMessage: `test-writer-verify: ${warning}` }));
  process.exit(0);
};

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  allow('could not parse hook input — tests not re-run');
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const relToRoot = (p) => relative(root, resolve(root, p)).split(sep).join('/');

function editedFromTranscript(path) {
  if (!path) return null;
  const file = path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
  if (!existsSync(file)) return null;
  const files = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    try {
      for (const c of JSON.parse(line).message?.content ?? []) {
        if (c.type === 'tool_use' && (c.name === 'Edit' || c.name === 'Write') && c.input?.file_path) files.push(c.input.file_path);
      }
    } catch { /* partial line while the transcript is being written */ }
  }
  return files;
}

function changedFromGit() {
  try {
    return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ''));
  } catch {
    return [];
  }
}

const edited = [...new Set((editedFromTranscript(input.agent_transcript_path) ?? changedFromGit()).map(relToRoot))];
const byPackage = new Map();
const typecheckPkgs = new Set();
for (const rel of edited) {
  const pkg = PACKAGES.find((p) => rel.startsWith(`${p}/`));
  if (!pkg || !existsSync(join(root, rel))) continue;
  const inPkg = rel.slice(pkg.length + 1);
  if (UNIT_TEST.test(rel) || TEST_HELPER.test(inPkg)) typecheckPkgs.add(pkg);
  if (!UNIT_TEST.test(rel) || INTEGRATION_TEST.test(rel)) continue;
  byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), inPkg]);
}
if (byPackage.size === 0 && typecheckPkgs.size === 0) allow();

const tail = (text) => text.split('\n').filter((l) => l.trim()).slice(-MAX_OUTPUT_LINES);
const failures = [];
const skipped = [];
for (const [pkg, files] of byPackage) {
  const cwd = join(root, pkg);
  const vitest = join(cwd, 'node_modules', '.bin', 'vitest');
  if (!existsSync(vitest)) { skipped.push(`${pkg} (deps not installed)`); continue; }
  const r = spawnSync(vitest, ['run', ...files], { cwd, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' } });
  if (r.error) { skipped.push(`${pkg} vitest (${r.error.code ?? r.error.message})`); continue; }
  if (r.status !== 0) failures.push({ what: `${pkg}: vitest run ${files.join(' ')}`, lines: tail(`${r.stdout}${r.stderr}`) });
}

for (const pkg of PACKAGES.filter((p) => typecheckPkgs.has(p))) {
  const cwd = join(root, pkg);
  const args = existsSync(join(cwd, 'tsconfig.test.json')) ? ['--noEmit', '-p', 'tsconfig.test.json'] : ['--noEmit'];
  const tsc = join(cwd, 'node_modules', '.bin', 'tsc');
  if (!existsSync(tsc)) { skipped.push(`${pkg} typecheck (deps not installed)`); continue; }
  const t = spawnSync(tsc, args, { cwd, encoding: 'utf8', timeout: RUN_TIMEOUT_MS });
  if (t.error) { skipped.push(`${pkg} typecheck (${t.error.code ?? t.error.message})`); continue; }
  if (t.status !== 0) {
    const errors = `${t.stdout}${t.stderr}`.split('\n').filter((l) => l.includes('error TS'));
    failures.push({ what: `${pkg}: tsc ${args.join(' ')}`, lines: errors.slice(0, MAX_OUTPUT_LINES) });
  }
}

const stateDir = join(tmpdir(), 'devdigest-test-writer-verify');
const stateFile = join(stateDir, `${String(input.agent_id ?? 'unknown').replace(/[^\w-]/g, '')}.json`);
const skippedNote = skipped.length ? `NOT RUN: ${skipped.join(', ')}` : '';

if (failures.length === 0) {
  rmSync(stateFile, { force: true });
  allow(skippedNote);
}

let blocks = 0;
try { blocks = JSON.parse(readFileSync(stateFile, 'utf8')).blocks ?? 0; } catch { /* first stop */ }
const summary = failures.map((f) => f.what).join('; ');

if (blocks >= MAX_BLOCKS) {
  rmSync(stateFile, { force: true });
  allow(`tests still failing after ${MAX_BLOCKS} forced retries (${summary}) — check the test-writer's report before continuing. ${skippedNote}`.trim());
}

mkdirSync(stateDir, { recursive: true });
writeFileSync(stateFile, JSON.stringify({ blocks: blocks + 1 }));
process.stderr.write([
  `Tests you wrote fail (${summary}). Retry ${blocks + 1}/${MAX_BLOCKS}.`,
  ...failures.flatMap((f) => [`--- ${f.what}`, ...f.lines]),
  'Fix the test (setup, mocks, queries, async waits) — never production code, never by weakening the assertion.',
  'If the failure is a real bug in production code, mark that case it.fails with a `// BUG(test-writer): …` comment and list it under "Bugs found".',
].join('\n') + '\n');
process.exit(2);
