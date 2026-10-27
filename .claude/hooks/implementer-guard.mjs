#!/usr/bin/env node
// PreToolUse guard for the `implementer` subagent (.claude/agents/implementer.md, Edit|Write|Bash).
// Enforces only the hard "Do not touch" rules from AGENTS.md; everything else lives in the prompt.
//   Edit/Write  blocked: outside the repo, server/clones, lockfiles, db migrations, .git, .githooks,
//               .claude, INSIGHTS.md (main thread runs /engineering-insights), .env*, root strays
//   Bash        blocked: git writes, gh pr/api, review-gate escape hatches, shell writes to the paths above
// Exit 0 = allowed, 2 = blocked (stderr goes back to the agent). Unparseable input fails closed.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, relative, resolve, sep } from 'node:path';

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

const { tool_name: tool, tool_input: args = {} } = input;

if (tool === 'Edit' || tool === 'Write') {
  if (!args.file_path) block(`${tool} call without file_path`);
  const reason = protectedPathReason(args.file_path);
  if (reason) block(reason);
} else if (tool === 'Bash') {
  const cmd = String(args.command ?? '');
  if (GIT_WRITE.test(cmd)) block('git write commands are not allowed — the main thread commits after pr-self-review');
  if (GH_WRITE.test(cmd)) block('gh pr/api commands are not allowed');
  if (ESCAPE_HATCH.test(cmd)) block('review-gate escape hatches are for humans only');
  const hit = PROTECTED_TOKENS.find(([, matches]) => matches(cmd));
  if (hit && SHELL_WRITE.test(cmd)) block(`shell write touching protected path "${hit[0]}" — use Edit/Write on allowed files`);
}

process.exit(0);
