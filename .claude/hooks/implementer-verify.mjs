#!/usr/bin/env node
// SubagentStop check for the `implementer` subagent (frontmatter `Stop`, auto-converted to SubagentStop).
// Typechecks (src + test where `tsconfig.test.json` exists) every package the agent edited, plus server
// after a reviewer-core edit. Edited files come from the transcript's Edit/Write calls; when the
// transcript also shows a write-ish Bash command or an Edit/Write outside the repo (e.g. a script in
// /tmp), that list may be incomplete, so the packages in `git status` are added too. No transcript →
// git status only. Errors → exit 2,
// the agent keeps working with the errors as its next instruction. Loop guards:
//   - at most MAX_BLOCKS blocks per agent run, then the agent may stop and the user gets a warning;
//   - missing deps or an unreadable input never block (warning only).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { mayWriteFiles } from './lib/shell-write.mjs';

const MAX_BLOCKS = 2;
const MAX_ERROR_LINES = 30;
const TSC_TIMEOUT_MS = 120_000;
const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e', 'mcp'];

const allow = (warning) => {
  if (warning) process.stdout.write(JSON.stringify({ systemMessage: `implementer-verify: ${warning}` }));
  process.exit(0);
};

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  allow('could not parse hook input — typecheck skipped');
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const packageOf = (p) => {
  const rel = relative(root, resolve(root, p)).split(sep).join('/');
  return PACKAGES.find((pkg) => rel.startsWith(`${pkg}/`)) ?? null;
};
const isOutsideRepo = (p) => relative(root, resolve(root, p)).startsWith('..');

// { files, incomplete } from the agent's transcript, or null when there is no transcript.
function editedFromTranscript(path) {
  if (!path) return null;
  const file = path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
  if (!existsSync(file)) return null;
  const files = [];
  let incomplete = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"tool_use"')) continue;
    try {
      for (const c of JSON.parse(line).message?.content ?? []) {
        if (c.type !== 'tool_use') continue;
        if ((c.name === 'Edit' || c.name === 'Write') && c.input?.file_path) {
          files.push(c.input.file_path);
          if (!packageOf(c.input.file_path)) incomplete ||= isOutsideRepo(c.input.file_path);
        } else if (/^bash$/i.test(c.name) && mayWriteFiles(c.input?.command ?? '')) {
          incomplete = true;
        }
      }
    } catch { /* partial line while the transcript is being written */ }
  }
  return { files, incomplete };
}

function changedFromGit() {
  try {
    return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => join(root, l.slice(3).replace(/^.* -> /, '')));
  } catch {
    return [];
  }
}

const fromTranscript = editedFromTranscript(input.agent_transcript_path);
const files = !fromTranscript
  ? changedFromGit()
  : fromTranscript.incomplete ? [...fromTranscript.files, ...changedFromGit()] : fromTranscript.files;
const touched = new Set(files.map(packageOf).filter(Boolean));
if (touched.has('reviewer-core')) touched.add('server'); // server compiles reviewer-core source
if (touched.size === 0) allow();

const failures = [];
const skipped = [];
for (const pkg of PACKAGES.filter((p) => touched.has(p))) {
  const cwd = join(root, pkg);
  const tsc = join(cwd, 'node_modules', '.bin', 'tsc');
  if (!existsSync(tsc)) { skipped.push(`${pkg} (deps not installed)`); continue; }
  const project = existsSync(join(cwd, 'tsconfig.test.json')) ? 'tsconfig.test.json' : 'tsconfig.json';
  const r = spawnSync(tsc, ['--noEmit', '-p', project], { cwd, encoding: 'utf8', timeout: TSC_TIMEOUT_MS });
  if (r.error) { skipped.push(`${pkg} (${r.error.code ?? r.error.message})`); continue; }
  if (r.status !== 0) {
    const errors = `${r.stdout}${r.stderr}`.split('\n').filter((l) => l.includes('error TS'));
    failures.push({ pkg, count: errors.length, lines: errors.slice(0, MAX_ERROR_LINES) });
  }
}

const stateDir = join(tmpdir(), 'devdigest-implementer-verify');
const stateFile = join(stateDir, `${String(input.agent_id ?? 'unknown').replace(/[^\w-]/g, '')}.json`);
const skippedNote = skipped.length ? `typecheck NOT RUN for ${skipped.join(', ')}` : '';

if (failures.length === 0) {
  rmSync(stateFile, { force: true });
  allow(skippedNote);
}

let blocks = 0;
try { blocks = JSON.parse(readFileSync(stateFile, 'utf8')).blocks ?? 0; } catch { /* first stop */ }
const summary = failures.map((f) => `${f.pkg}: ${f.count} error(s)`).join(', ');

if (blocks >= MAX_BLOCKS) {
  rmSync(stateFile, { force: true });
  allow(`typecheck still failing after ${MAX_BLOCKS} forced retries (${summary}) — check the implementer's report before continuing. ${skippedNote}`.trim());
}

mkdirSync(stateDir, { recursive: true });
writeFileSync(stateFile, JSON.stringify({ blocks: blocks + 1 }));
process.stderr.write([
  `Typecheck failed (${summary}). Retry ${blocks + 1}/${MAX_BLOCKS}.`,
  ...failures.flatMap((f) => [`--- ${f.pkg}`, ...f.lines, ...(f.count > f.lines.length ? [`… ${f.count - f.lines.length} more`] : [])]),
  'Fix the errors your changes caused, re-run the typecheck, and update the Verification table.',
  'If an error is in a file you did not change and the plan does not cover, do not fix it — list it under Blockers and finish.',
].join('\n') + '\n');
process.exit(2);
