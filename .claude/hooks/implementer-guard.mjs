#!/usr/bin/env node
// PreToolUse guard for the `implementer` subagent (.claude/agents/implementer.md, Edit|Write|Bash).
// Enforces only the hard "Do not touch" rules from AGENTS.md; everything else lives in the prompt.
//   Edit/Write  blocked: outside the repo, server/clones, lockfiles, db migrations, .git, .githooks,
//               .claude, INSIGHTS.md (main thread runs /engineering-insights), .env*, root strays
//   Write       also blocked on test paths: new tests are test-writer's (Edit of an existing test stays
//               allowed for the plan's compile-only changes)
//   Bash        blocked: git writes, gh pr/api, review-gate escape hatches, shell writes to the paths above,
//               and any shell write of file content outside a temp dir (redirects, tee, sed -i, perl -i,
//               inline interpreter scripts) — file content changes go through Edit/Write only, so the
//               Stop hook (implementer-verify.mjs) sees every edited package in the transcript;
//               recursive deletes (rm -r / -R / -rf / --recursive) anywhere; cp / mv / ln / touch onto a test path
// Exit 0 = allowed, 2 = blocked (stderr goes back to the agent). Unparseable input fails closed.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, relative, resolve, sep } from 'node:path';
import { recursiveDeleteReason, shellWriteReason } from './lib/shell-write.mjs';

const block = (reason) => {
  process.stderr.write(`implementer-guard: ${reason}. Do not work around this — report it in your Implementation Report.\n`);
  process.exit(2);
};

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block('could not parse hook input');
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const ROOT_STRAYS = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);
const PROTECTED_DIRS = ['server/clones/', 'server/src/db/migrations/', '.git/', '.githooks/', '.claude/'];

function protectedPathReason(absPath) {
  const rel = relative(root, resolve(absPath)).split(sep).join('/');
  if (rel.startsWith('..') || rel === '') {
    const tmp = relative(resolve(tmpdir()), resolve(absPath));
    return tmp.startsWith('..') ? `"${absPath}" is outside the repository` : null;
  }
  const name = basename(rel);
  if (ROOT_STRAYS.has(rel)) return `"${rel}" is a git-ignored root stray (not a workspace)`;
  if (name === 'pnpm-lock.yaml' || name === 'package-lock.json') return `"${rel}" changes only via pnpm/npm install`;
  if (name === 'INSIGHTS.md') return `"${rel}" is written by the main thread via /engineering-insights`;
  if (/^\.env/.test(name)) return `"${rel}" may hold secrets`;
  const dir = PROTECTED_DIRS.find((d) => rel.startsWith(d));
  if (dir === 'server/src/db/migrations/') return `"${rel}" is generated — edit src/db/schema and run pnpm db:generate`;
  if (dir) return `"${rel}" is protected (${dir})`;
  return null;
}

const GIT_WRITE = /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push|reset|checkout|switch|restore|stash|rebase|merge|clean|cherry-pick|revert|am|apply|update-ref|config|tag|branch\s+-[dDmM])\b/;
const GH_WRITE = /\bgh\s+(?:pr|api|release|repo)\b/;
const ESCAPE_HATCH = /--no-verify\b|PR_SELF_REVIEW_SKIP|\.git\/pr-self-review/;
// A write-ish shell op; `2>`, `>&` and `> /dev/null` are not writes.
const SHELL_WRITE = /(?:^|[^0-9&>])>{1,2}(?!&)\s*(?!\/dev\/null)\S|\btee\b|\bsed\s+(?:-[a-zA-Z]*i|--in-place)|\bperl\s+-[a-zA-Z]*i|\b(?:rm|mv|cp|touch|ln|truncate|chmod)\s/;
const PROTECTED_TOKENS = [
  'server/clones', 'src/db/migrations', 'pnpm-lock.yaml', 'package-lock.json', '.githooks', '.claude/', 'INSIGHTS.md',
].map((t) => [t, (cmd) => cmd.includes(t)]).concat([['.env', (cmd) => /(?:^|[\s/'"=])\.env\b/.test(cmd)]]);

// Test files and test infrastructure — owned by test-writer (same set as its agent-guard allowlist).
const TEST_PATH = [
  /^(?:server|client|reviewer-core|mcp)\/.*\.test\.tsx?$/,
  /^server\/test\//,
  /^client\/src\/test\//,
  /^reviewer-core\/test\//,
  /^mcp\/test\//,
  /^e2e\/specs\/.*\.flow\.json$/,
];
const relPath = (p) => relative(root, resolve(root, p)).split(sep).join('/'); // relative paths: against the repo root
const isTestPath = (p) => TEST_PATH.some((re) => re.test(relPath(p)));
// Shell copy / move / link / touch whose arguments name a test path (the last argument is the target,
// but any test-path argument of these commands is enough to send the agent to test-writer).
function shellTestWrite(cmd) {
  let dir = root; // follows `cd <dir>` segments, so `cd client && cp a.tsx a.test.tsx` is caught
  for (const seg of String(cmd).split(/&&|\|\||;|\n|\|/)) {
    const cd = seg.trim().match(/^cd\s+(\S+)$/);
    if (cd) { dir = resolve(dir, cd[1].replace(/^['"]|['"]$/g, '')); continue; }
    const m = seg.trim().match(/^(cp|mv|ln|touch|install)\s+(.*)$/);
    if (!m) continue;
    const args = m[2].split(/\s+/).filter((a) => a && !a.startsWith('-')).map((a) => a.replace(/^['"]|['"]$/g, ''));
    const target = m[1] === 'touch' ? args : args.slice(-1);
    const hit = target.find((a) => isTestPath(resolve(dir, a)));
    if (hit) return `${m[1]} onto test path "${hit}"`;
  }
  return null;
}

const { tool_name: tool, tool_input: args = {} } = input;

if (tool === 'Edit' || tool === 'Write') {
  if (!args.file_path) block(`${tool} call without file_path`);
  const reason = protectedPathReason(args.file_path);
  if (reason) block(reason);
  if (tool === 'Write' && isTestPath(args.file_path)) {
    block(`Write on test path "${relPath(args.file_path)}" — new tests are written by test-writer from the plan's Tests table; for a compile-only change the plan lists under "Existing tests affected" use Edit`);
  }
} else if (tool === 'Bash') {
  const cmd = String(args.command ?? '');
  if (GIT_WRITE.test(cmd)) block('git write commands are not allowed — the main thread commits after pr-self-review');
  if (GH_WRITE.test(cmd)) block('gh pr/api commands are not allowed');
  if (ESCAPE_HATCH.test(cmd)) block('review-gate escape hatches are for humans only');
  const hit = PROTECTED_TOKENS.find(([, matches]) => matches(cmd));
  if (hit && SHELL_WRITE.test(cmd)) block(`shell write touching protected path "${hit[0]}" — use Edit/Write on allowed files`);
  const tw = shellTestWrite(cmd);
  if (tw) block(`${tw} — new tests are written by test-writer`);
  const rmr = recursiveDeleteReason(cmd);
  if (rmr) block(`${rmr} is not allowed — uncommitted work can't be recovered; delete the files the plan names one by one (rm <file>)`);
  const write = shellWriteReason(cmd);
  if (write) {
    block(`${write} is not allowed — change file content with Edit/Write (several Edit calls in one message run in parallel); "> /dev/null", "2>&1" and writes under /tmp are fine; for read-only checks use jq / grep / sed -n`);
  }
}

process.exit(0);
