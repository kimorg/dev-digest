#!/usr/bin/env node
// PreToolUse guard shared by the review, test and doc subagents. Profile = first argument:
//   test-writer  Edit/Write: test files, test helpers/fixtures, e2e flows. Bash: read-only + test/typecheck runners
//   doc-writer   Edit/Write: package docs/ and READMEs (.md only). Bash: none
//   verifier     Edit/Write: none. Bash: read-only + test/typecheck runners          (plan-verifier)
//   readonly     Edit/Write: none. Bash: read-only commands                          (architecture-/security-reviewer)
// Bash is an allowlist: every segment of a compound command must start with an allowed command;
// shell writes, command/process substitution and env-var prefixes are blocked.
// Exit 0 = allowed, 2 = blocked (stderr goes back to the agent). Unknown profile or bad input fails closed.
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const profile = process.argv[2];

const block = (reason) => {
  process.stderr.write(`agent-guard[${profile}]: ${reason}. Do not work around this — report it in your final message.\n`);
  process.exit(2);
};

const PKG = '(?:server|client|reviewer-core|e2e)';
const WRITE_PATHS = {
  'test-writer': [
    /^server\/test\//,
    /^server\/src\/.+\.test\.ts$/,
    /^client\/src\/.+\.test\.tsx?$/,
    /^client\/src\/test\//,
    /^reviewer-core\/test\//,
    /^e2e\/specs\/\d{2}-[a-z0-9-]+\.flow\.json$/,
  ],
  'doc-writer': [
    /^README\.md$/,
    new RegExp(`^${PKG}/README\\.md$`),
    new RegExp(`^${PKG}/docs/.+\\.md$`),
    /^server\/src\/modules\/[^/]+\/README\.md$/,
  ],
  verifier: [],
  readonly: [],
};

const READ_ONLY = [
  /^git(?:\s+-C\s+\S+|\s+--no-pager)*\s+(?:diff|log|show|status|blame|ls-files|rev-parse|merge-base|grep|shortlog)\b/,
  /^(?:ls|cat|head|tail|wc|grep|rg|find|sort|uniq|cut|stat|file|pwd|tree|jq|diff|comm|basename|dirname|realpath|echo|printf|true|cd)\b/,
];
const RUNNERS = [
  /^pnpm\s+(?:run\s+)?(?:test|typecheck)\b/,
  /^pnpm\s+exec\s+(?:vitest\s+run|tsc\s+--noEmit)\b/,
  /^npm\s+(?:test|run\s+(?:test|typecheck))\b/,
  /^npx\s+(?:vitest\s+run|tsc\s+--noEmit)\b/,
];
const BASH = {
  'test-writer': [...READ_ONLY, ...RUNNERS],
  'doc-writer': [],
  verifier: [...READ_ONLY, ...RUNNERS],
  readonly: READ_ONLY,
};
// Flags that turn an allowed command into a writer or a code runner.
const FORBIDDEN_ARGS = [
  [/^find\b.*\s-(?:exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)\b/, 'find with -exec/-delete/-fprint'],
  [/^git\b.*\s--output(?:=|\s)/, 'git --output writes a file'],
  [/^git\b.*\s(?:-O|--open-files-in-pager)\b/, 'git grep -O runs a pager'],
  [/^rg\b.*\s--pre(?:=|\s)/, 'rg --pre runs a command'],
  [/^(?:pnpm|npm|npx)\b.*\s(?:-u|--update)\b/, 'updating snapshots rewrites expectations'],
];

// Splits on unquoted ; && || | & and newlines. Returns null on an unbalanced quote.
function segments(cmd) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      cur += c;
      if (c === '\\' && quote === '"') cur += cmd[++i] ?? '';
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (c === '\\') { cur += c + (cmd[++i] ?? ''); continue; }
    const redirectAmp = c === '&' && (cur.endsWith('>') || cmd[i + 1] === '>'); // 2>&1, &>/dev/null
    if (!redirectAmp && (c === ';' || c === '\n' || c === '|' || c === '&')) {
      out.push(cur);
      cur = '';
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
      continue;
    }
    cur += c;
  }
  if (quote) return null;
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

const unquoted = (s) => s.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""');

function checkBash(cmd) {
  const allowed = BASH[profile];
  if (allowed.length === 0) block('Bash is not available to this agent');
  if (/\$\(|`/.test(cmd)) block('command substitution is not allowed');
  const parts = segments(cmd);
  if (!parts) block('unbalanced quotes in command');
  for (const part of parts) {
    const bare = unquoted(part);
    if (/[<>]\(/.test(bare)) block('process substitution is not allowed');
    const rest = bare.replace(/\d?>&\d/g, '').replace(/(?:\d|&)?>>?\s*\/dev\/null/g, '');
    if (rest.includes('>')) block(`shell write in "${part}" — this agent may not write files from Bash`);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(part)) block(`env-var prefix in "${part}" is not allowed`);
    if (!allowed.some((re) => re.test(part))) block(`"${part.split(/\s+/).slice(0, 3).join(' ')}" is not on this agent's Bash allowlist`);
    const bad = FORBIDDEN_ARGS.find(([re]) => re.test(part));
    if (bad) block(`${bad[1]}: "${part}"`);
  }
}

if (!Object.hasOwn(WRITE_PATHS, profile ?? '')) block(`unknown profile "${profile}"`);

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block('could not parse hook input');
}

const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const { tool_name: tool, tool_input: args = {} } = input;

if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
  const target = args.file_path ?? args.notebook_path;
  if (!target) block(`${tool} call without file_path`);
  const rel = relative(root, resolve(root, target)).split(sep).join('/');
  if (rel.startsWith('..') || rel === '') block(`"${target}" is outside the repository`);
  if (!WRITE_PATHS[profile].some((re) => re.test(rel))) {
    block(WRITE_PATHS[profile].length ? `"${rel}" is outside the paths this agent may write` : 'this agent is read-only');
  }
} else if (tool === 'Bash') {
  checkBash(String(args.command ?? ''));
}

process.exit(0);
