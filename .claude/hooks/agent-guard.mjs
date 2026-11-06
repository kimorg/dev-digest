#!/usr/bin/env node
// PreToolUse guard shared by the review, test and doc subagents. Profile = first argument:
//   test-writer  Edit/Write: test files, test helpers/fixtures, e2e flows. Bash: read-only + test/typecheck runners
//   doc-writer   Edit/Write: package docs/ and READMEs (.md only). Bash: none
//   verifier     Edit/Write: none. Bash: read-only + test/typecheck runners          (plan-verifier)
//   readonly     Edit/Write: none. Bash: read-only commands                          (architecture-/security-reviewer)
//   spec-creator Edit/Write: spec files NNN-<slug>.md in specs/ and <package>/specs/; a new file must
//                take the next free NNN across all spec folders. Agent: researcher / brainstorm only.
//                Skill (on demand): security / postgresql-table-design only. Bash: none
//   workflow-retro  The /workflow-retro skill (main thread, hook in its SKILL.md frontmatter). Metadata-only:
//                Tools: only Read, Grep, Glob, Bash, Edit, Write, AskUserQuestion (default-deny: no Agent,
//                Skill, Web*, MCP, Artifact…). Read/Grep/Glob: docs/retro/ledger/, the skill folder and the
//                collector JSON (<tmp>/workflow-retro*.json) only — no transcripts, code, plans or reports.
//                Edit/Write: docs/retro/ledger/<lower-kebab>.md only (not README.md, no symlinks); Write only
//                creates a new file, Edit only appends at the end. Bash: the collector (absolute path) and
//                jq / head / tail / wc on stdin. Active only during the turn that invoked /workflow-retro.
// Bash is an allowlist: every segment of a compound command must start with an allowed command;
// shell writes, command/process substitution and env-var prefixes are blocked. test-writer / verifier /
// readonly may also use `for <name> in <words>; do <cmd>; done` and `timeout <N> <cmd>`: <cmd> is checked
// like any other segment.
// Exit 0 = allowed, 2 = blocked (stderr goes back to the agent). Unknown profile or bad input fails closed.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

const profile = process.argv[2];

const block = (reason) => {
  process.stderr.write(`agent-guard[${profile}]: ${reason}. Do not work around this — report it in your final message.\n`);
  process.exit(2);
};

const PKG = '(?:server|client|reviewer-core|e2e|mcp)';
const WRITE_PATHS = {
  'test-writer': [
    /^server\/test\//,
    /^server\/src\/.+\.test\.ts$/,
    /^client\/src\/.+\.test\.tsx?$/,
    /^client\/src\/test\//,
    /^reviewer-core\/test\//,
    /^mcp\/test\//,
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
  'spec-creator': [
    /^specs\/\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
    /^(?:server|client|reviewer-core|mcp)\/specs\/\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
  ],
  // Lower-kebab only, so the format file README.md is not writable.
  'workflow-retro': [/^docs\/retro\/ledger\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/],
};
// Tools a profile may call at all (default-deny). Profiles not listed rely on their agent's `tools:`.
const TOOLS = { 'workflow-retro': ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'AskUserQuestion'] };
// Spec numbers are one sequence across these folders (spec-creator profile).
const SPEC_DIRS = ['specs', 'server/specs', 'client/specs', 'reviewer-core/specs', 'mcp/specs'];
// Subagents a profile may spawn; profiles not listed may not spawn any.
const AGENTS = { 'spec-creator': ['researcher', 'brainstorm'] };
// Skills a profile may load on demand (Skill tool); preloaded `skills:` are not affected.
const SKILLS = { 'spec-creator': ['security', 'postgresql-table-design'] };

// sed -n addresses: a line number, `$` or a `/regex/` (no unescaped `/`, single-quoted), then only `p`.
const SED_NUM = String.raw`(?:\d+|\$)`;
const SED_ADDR = String.raw`(?:\d+|\$|/(?:[^/\\'\n]|\\[^'\n])*/)`;
const READ_ONLY = [
  /^git(?:\s+-C\s+\S+|\s+--no-pager)*\s+(?:diff|log|show|status|blame|ls-files|rev-parse|merge-base|grep|shortlog)\b/,
  /^(?:ls|cat|head|tail|wc|grep|rg|find|sort|uniq|cut|stat|file|pwd|tree|jq|diff|comm|basename|dirname|realpath|echo|printf|true|cd)\b/,
  // `sed -n '12,40p' f` or `sed -n '/^## Tests/,/^## /p' f`. Any other sed script or flag (-i, -e, w, e, ;) can write or run.
  new RegExp(String.raw`^sed\s+-n\s+(?:(['"]?)${SED_NUM}(?:,${SED_NUM})?p\1|'${SED_ADDR}(?:,${SED_ADDR})?p')(?:\s+[^\s-][^\s;&|<>]*)*$`),
];
const RUNNERS = [
  /^pnpm\s+(?:run\s+)?(?:test|typecheck)\b/,
  /^pnpm\s+exec\s+(?:vitest\s+run|tsc\s+--noEmit|next\s+typegen)\b/,
  /^pnpm\s+vitest\s+run\b/,
  /^npm\s+(?:test|run\s+(?:test|typecheck))\b/,
  /^npx\s+(?:vitest\s+run|tsc\s+--noEmit)\b/,
];
const DOCKER_READ = [/^docker\s+(?:info|ps)\b/];
// Profiles whose segments may be `for <name> in <words>` / `do <cmd>` / `done` and `timeout <N> <cmd>`.
// The loop variable is lower-case so it cannot shadow PATH, IFS, LD_PRELOAD, NODE_OPTIONS …
const LOOP_PROFILES = new Set(['test-writer', 'verifier', 'readonly']);
const FOR_HEAD = /^for\s+[a-z_][a-z0-9_]*\s+in(?:\s+[^\s;&|<>()`]+)*$/;
const DONE = /^done(?:\s+\d?>&\d|\s+(?:\d|&)?>>?\s*\/dev\/null)*$/;
const BASH = {
  'test-writer': [...READ_ONLY, ...RUNNERS, ...DOCKER_READ],
  'doc-writer': [],
  verifier: [...READ_ONLY, ...RUNNERS, ...DOCKER_READ],
  readonly: READ_ONLY,
  'spec-creator': [],
  'workflow-retro': [], // the collector + stdin filters, added once the repo root is known (retroBash)
};
// /workflow-retro Bash: the collector by absolute path (a relative one could follow a `cd`) with plain flag
// values, and filters that read stdin only — no file arguments, so Bash cannot read transcripts, code or secrets.
const retroBash = (root) => {
  const r = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`^node\\s+(["']?)${r}/\\.claude/skills/workflow-retro/scripts/collect\\.mjs\\1(?:\\s+--[a-z-]+(?:\\s+[\\w:./+-]+)?)*$`),
    /^jq(?:\s+-[a-zA-Z]+)*\s+(?:'[^']*'|"[^"]*")$/,
    /^(?:head|tail)(?:\s+-n\s*\d+|\s+-\d+)?$/,
    /^wc(?:\s+-[lcw])?$/,
  ];
};
const RETRO_JSON = /^workflow-retro[\w.-]*\.json$/;
const TMP_ROOTS = [...new Set([resolve(tmpdir()), '/tmp'])];
const underTmp = (p) => p.startsWith('/') && TMP_ROOTS.some((t) => resolve(p).startsWith(t + sep));
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
  const retro = profile === 'workflow-retro';
  const allowed = retro ? retroBash(root) : BASH[profile];
  if (allowed.length === 0) block('Bash is not available to this agent');
  // The SKILL.md commands spell the repo root as "$(git rev-parse --show-toplevel)/…" — the only substitution allowed.
  if (retro) cmd = cmd.replaceAll('$(git rev-parse --show-toplevel)', root);
  if (/\$\(|`/.test(cmd)) block('command substitution is not allowed');
  const parts = segments(cmd);
  if (!parts) block('unbalanced quotes in command');
  const loops = LOOP_PROFILES.has(profile);
  for (const part of parts) {
    const bare = unquoted(part);
    if (/[<>]\(/.test(bare)) block('process substitution is not allowed');
    const rest = bare.replace(/\d?>&\d/g, '').replace(/(?:\d|&)?>>?\s*\/dev\/null/g, '');
    if (rest.includes('>')) block(`shell write in "${part}" — this agent may not write files from Bash`);
    // `do <cmd>` and `timeout <N> <cmd>` are checked as <cmd> — every rule below applies to it.
    let cmdPart = part;
    if (loops) {
      cmdPart = cmdPart.replace(/^do(?:\s+|$)/, '');
      while (/^timeout\s+\d+(?:\.\d+)?[smhd]?\s+\S/.test(cmdPart)) cmdPart = cmdPart.replace(/^timeout\s+\S+\s+/, '');
      if (!cmdPart || FOR_HEAD.test(unquoted(cmdPart)) || DONE.test(cmdPart)) continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(cmdPart)) block(`env-var prefix in "${part}" is not allowed`);
    if (!allowed.some((re) => re.test(cmdPart))) block(`"${cmdPart.split(/\s+/).slice(0, 3).join(' ')}" is not on this agent's Bash allowlist`);
    const bad = FORBIDDEN_ARGS.find(([re]) => re.test(cmdPart));
    if (bad) block(`${bad[1]}: "${part}"`);
  }
}

// A new spec file must take max(existing NNN) + 1 over every spec folder, so numbers stay unique repo-wide.
function checkNewSpecNumber(rel) {
  const num = Number(rel.split('/').pop().slice(0, 3));
  let max = 0;
  for (const dir of SPEC_DIRS) {
    let names = [];
    try {
      names = readdirSync(resolve(root, dir));
    } catch {
      continue; // folder does not exist yet
    }
    for (const n of names) if (/^\d{3}-.+\.md$/.test(n)) max = Math.max(max, Number(n.slice(0, 3)));
  }
  const next = String(max + 1).padStart(3, '0');
  if (num !== max + 1) block(`new spec "${rel}" must use the next free number ${next} (highest in ${SPEC_DIRS.join(', ')} is ${String(max).padStart(3, '0')})`);
}

// Claude Code keeps hooks from a skill's frontmatter for the rest of the session, so without this the
// retro's limits would also block every later task (applying its proposals, /engineering-insights …).
// Guard only the turn that invoked /workflow-retro: the hook's prompt_id belongs to a human transcript
// entry that holds `<command-name>/workflow-retro</command-name>`. A prompt that is not in the transcript
// yet (it is written asynchronously), a missing prompt_id or an unreadable transcript stay guarded.
function retroTurnActive({ prompt_id: id, transcript_path: file }) {
  if (!id || !file) return true;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return true;
  }
  const needle = `"promptId":"${id}"`;
  let seen = false;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
    const start = text.lastIndexOf('\n', i) + 1;
    const end = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i);
    let entry;
    try {
      entry = JSON.parse(text.slice(start, end));
    } catch {
      continue; // a partially written last line
    }
    if (entry.type !== 'user' || entry.origin?.kind !== 'human' || entry.promptId !== id) continue;
    if (JSON.stringify(entry.message?.content ?? '').includes('<command-name>/workflow-retro</command-name>')) return true;
    seen = true;
  }
  return !seen;
}

// /workflow-retro analyses metadata only: the ledger, its own skill folder and the collector JSON.
function checkRetroRead() {
  const p = tool === 'Read' ? args.file_path : args.path;
  const why = 'the retro reads only docs/retro/ledger/, .claude/skills/workflow-retro/ and the collector JSON (--out <scratchpad>/workflow-retro*.json) — not transcripts, code, plans, specs or reports';
  if (!p) block(`${tool} needs an explicit path: ${why}`);
  if (tool === 'Glob' && (String(args.pattern ?? '').includes('..') || String(args.pattern ?? '').startsWith('/'))) block('Glob pattern must stay inside the path');
  const abs = resolve(root, p);
  const rel = relative(root, abs).split(sep).join('/');
  const inside = (dir) => rel === dir || rel.startsWith(`${dir}/`);
  const repoOk = inside('docs/retro/ledger') || inside('.claude/skills/workflow-retro');
  const tmpOk = tool === 'Read' && underTmp(abs) && RETRO_JSON.test(abs.split(sep).pop());
  if (!repoOk && !tmpOk) block(`"${p}": ${why}`);
  let real = null;
  try {
    real = realpathSync(abs);
  } catch {
    return; // missing file: the tool reports it
  }
  if (repoOk && !real.startsWith(realpathSync(root) + sep)) block(`"${p}" resolves outside the repository (symlink)`);
  if (tmpOk && real !== abs) block(`"${p}" is a symlink`);
}

// The ledger is append-only: a new file is created with Write, an existing one only grows at its end.
function checkLedgerWrite(rel) {
  const abs = resolve(root, rel);
  let dir;
  try {
    dir = realpathSync(dirname(abs));
  } catch {
    block('docs/retro/ledger/ does not exist — it must be created by a human, with its README.md');
  }
  if (dir !== join(realpathSync(root), 'docs', 'retro', 'ledger')) block(`"${rel}" resolves outside docs/retro/ledger/ (symlink)`);
  let st = null;
  try {
    st = lstatSync(abs);
  } catch {
    /* a new file */
  }
  if (st?.isSymbolicLink()) block(`"${rel}" is a symlink`);
  if (tool === 'Write') {
    if (st) block(`"${rel}" exists and the ledger is append-only — append with Edit: old_string = the last lines of the file, new_string = the same lines + the new entry`);
    return;
  }
  if (!st) block(`"${rel}" does not exist — create it with Write from the header in docs/retro/ledger/README.md`);
  const oldStr = String(args.old_string ?? '');
  const newStr = String(args.new_string ?? '');
  if (args.replace_all) block('replace_all is not allowed in the append-only ledger');
  if (!oldStr.trim()) block('old_string must be the last lines of the file');
  if (!newStr.startsWith(oldStr)) block('append-only ledger: new_string must start with old_string unchanged — existing lines are never edited or deleted');
  if (!readFileSync(abs, 'utf8').trimEnd().endsWith(oldStr.trimEnd())) {
    block('append-only ledger: old_string must be the end of the file — new entries go at the bottom, not in the middle');
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

if (profile === 'workflow-retro' && !retroTurnActive(input)) process.exit(0);
if (TOOLS[profile] && !TOOLS[profile].includes(tool)) {
  block(`"${tool}" is not available during /workflow-retro (allowed: ${TOOLS[profile].join(', ')}). Applying proposals is a separate task in a new message`);
}

if (profile === 'workflow-retro' && ['Read', 'Grep', 'Glob'].includes(tool)) checkRetroRead();

if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
  const target = args.file_path ?? args.notebook_path;
  if (!target) block(`${tool} call without file_path`);
  const rel = relative(root, resolve(root, target)).split(sep).join('/');
  if (rel.startsWith('..') || rel === '') block(`"${target}" is outside the repository`);
  if (!WRITE_PATHS[profile].some((re) => re.test(rel))) {
    block(WRITE_PATHS[profile].length ? `"${rel}" is outside the paths this agent may write` : 'this agent is read-only');
  }
  if (profile === 'spec-creator' && !existsSync(resolve(root, rel))) checkNewSpecNumber(rel);
  if (profile === 'workflow-retro') checkLedgerWrite(rel);
} else if (tool === 'Agent' || tool === 'Task') {
  const type = args.subagent_type ?? 'general-purpose';
  if (!(AGENTS[profile] ?? []).includes(type)) block(`this agent may not spawn "${type}" (allowed: ${(AGENTS[profile] ?? []).join(', ') || 'none'})`);
} else if (tool === 'Skill') {
  const name = String(args.skill ?? '').replace(/^\//, '');
  if (!(SKILLS[profile] ?? []).includes(name)) block(`this agent may not load skill "${name}" (allowed: ${(SKILLS[profile] ?? []).join(', ') || 'none'})`);
} else if (tool === 'Bash') {
  checkBash(String(args.command ?? ''));
}

process.exit(0);
