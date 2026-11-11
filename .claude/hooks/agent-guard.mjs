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
// Bash is an allowlist: every segment of a compound command must start with an allowed command, named
// exactly (no path, no `test:x` script); shell writes, command/process substitution and env-var prefixes
// are blocked. test-writer / verifier / readonly may also use `for <name> in <words>; do <cmd>; done` and
// `timeout <N> <cmd>`: <cmd> is checked like any other segment. Forbidden flags (FORBIDDEN_ARGS) are matched
// on the words after quote removal; brace expansion, unquoted ( ) and globs that could expand into a flag
// (`*`, `-de*`) are refused; the only `$` expansion allowed is the variable of an enclosing for-loop
// (between its `for` and `done`), whose words must be plain path-like tokens (LOOP_WORD) — quoted ("$f")
// when they hold a glob. `cd` / `git -C` may not enter server/clones/ (untrusted imported repos).
// Every check is linear in the command length (no backtracking regex), and commands are capped at MAX_COMMAND.
// Exit 0 = allowed, 2 = blocked (stderr goes back to the agent). Unknown profile or bad input fails closed.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

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
// Command names end at whitespace, not at `\b`: `file/../../bin/sh` or `pnpm test:x` must not pass as `file` / `pnpm test`.
const READ_ONLY = [
  /^git(?:\s+-C\s+\S+|\s+--no-pager)*\s+(?:diff|diff-tree|log|show|status|blame|ls-files|rev-parse|merge-base|grep|shortlog)(?=\s|$)/,
  /^(?:ls|cat|head|tail|wc|grep|rg|find|sort|uniq|cut|stat|file|pwd|tree|jq|diff|comm|basename|dirname|realpath|echo|printf|true|cd)(?=\s|$)/,
  // `sed -n '12,40p' f` or `sed -n '/^## Tests/,/^## /p' f`. Any other sed script or flag (-i, -e, w, e, ;) can write or run.
  new RegExp(String.raw`^sed\s+-n\s+(?:(['"]?)${SED_NUM}(?:,${SED_NUM})?p\1|'${SED_ADDR}(?:,${SED_ADDR})?p')(?:\s+[^\s-][^\s;&|<>]*)*$`),
];
const RUNNERS = [
  /^pnpm\s+(?:run\s+)?(?:test|typecheck)(?=\s|$)/,
  /^pnpm\s+exec\s+(?:vitest\s+run|tsc\s+--noEmit|next\s+typegen)(?=\s|$)/,
  /^pnpm\s+vitest\s+run(?=\s|$)/,
  /^npm\s+(?:test|run\s+(?:test|typecheck))(?=\s|$)/,
  /^npx\s+(?:vitest\s+run|tsc\s+--noEmit)(?=\s|$)/,
];
const DOCKER_READ = [/^docker\s+(?:info|ps)(?=\s|$)/];
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
    // A flag value may not start with `-`: otherwise `--a --b …` parses as flag-or-value in 2^n ways and the
    // failing match backtracks for minutes (38 flags ≈ 14 s) — past the hook timeout.
    new RegExp(`^node\\s+(["']?)${r}/\\.claude/skills/workflow-retro/scripts/collect\\.mjs\\1(?:\\s+--[a-z-]+(?:\\s+[\\w:./+][\\w:./+-]*)?)*$`),
    // No -f / -L: they read files. The filter itself is checked in checkBash (JQ_FORBIDDEN).
    /^jq(?:\s+-[a-eg-zA-KM-Z]+)*\s+(?:'[^']*'|"[^"]*")$/,
    /^(?:head|tail)(?:\s+-n\s*\d+|\s+-\d+)?$/,
    /^wc(?:\s+-[lcw])?$/,
  ];
};
const RETRO_JSON = /^workflow-retro[\w.-]*\.json$/;
const TMP_ROOTS = [...new Set([resolve(tmpdir()), '/tmp'])];
const underTmp = (p) => p.startsWith('/') && TMP_ROOTS.some((t) => resolve(p).startsWith(t + sep));
// Flags that turn an allowed command into a writer or a code runner: { cmd, sub (git subcommand), arg, why }.
// Matched against the shell words after quote removal, so `'-delete'` or `-del''ete` is the flag it spells.
// `-[^-]*X` is a short-option cluster holding X (`-no out` = `-n -o out`); GNU long options take unambiguous
// prefixes (`sort --o=x`), hence the short `--o` / `--co` / `--te` stems.
const RUNNER = /^(?:pnpm|npm|npx)$/;
const FORBIDDEN_ARGS = [
  { cmd: /^find$/, arg: /^-(?:exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)$/, why: 'find with -exec/-delete/-fprint' },
  // git accepts unambiguous prefixes of long options (--outp=…).
  { cmd: /^git$/, arg: /^--out(?:p(?:u(?:t)?)?)?(?:=|$)/, why: 'git --output writes a file' },
  { cmd: /^git$/, sub: /^grep$/, arg: /^(?:-[^-]*O|--op)/, why: 'git grep -O runs a pager' },
  { cmd: /^rg$/, arg: /^--(?:pre|hostname-bin)(?:=|$)/, why: 'rg --pre / --hostname-bin runs a program' },
  { cmd: /^sort$/, arg: /^(?:-[^-]*[oT]|--(?:o|co|te))/, why: 'sort -o / --output / --compress-program / -T writes files or runs a program' },
  { cmd: /^tree$/, arg: /^(?:-[^-]*[oR]|--o)/, why: 'tree -o / -R writes files' },
  { cmd: /^file$/, arg: /^(?:-[^-]*C|--co)/, why: 'file -C compiles a magic file (writes)' },
  // It would overwrite a for-loop variable with a value the loop-word check never saw.
  { cmd: /^printf$/, arg: /^-v/, why: 'printf -v assigns a variable' },
  // vitest's CLI parser also takes prefixes of --update (`--u`, `--upd`).
  { cmd: RUNNER, arg: /^(?:-[a-zA-Z]*u[a-zA-Z]*|--u(?:p(?:d(?:a(?:t(?:e)?)?)?)?)?)(?:=|$)/, why: 'updating snapshots rewrites expectations' },
  {
    cmd: RUNNER,
    arg: /^(?:--(?:outputFile|coverage|config|root|dir|workspace|globalSetup|setupFiles|attachmentsDir|ui|open|api|browser|inspect|inspectBrk|watch|clearCache|mergeReports|standalone)|-[crw])(?:[.=]|$)|^--reporter=(?:html|blob)\b/,
    why: 'this vitest option writes files, loads other code or starts a server',
  },
  // tsc option names are case-insensitive; with --noEmit these still write (profiles, traces, .tsbuildinfo).
  {
    cmd: RUNNER,
    arg: /^--?(?:generateCpuProfile|generateTrace|outDir|outFile|out|declarationDir|build|b|init|watch|incremental|i|tsBuildInfoFile|composite|listEmittedFiles)(?:=|$)/i,
    why: 'this tsc option writes files',
  },
];
// jq builtins that read the environment or load modules from disk (/workflow-retro filters). jq ≤ 1.6 parses `$ ENV`.
const JQ_FORBIDDEN = /\$\s*ENV\b|\benv\b|\bimport\b|\binclude\b|\bmodulemeta\b|\bget_search_list\b/;
// Imported repos (server/clones/) are untrusted: entering one would run its package scripts, node_modules/.bin
// and the git config of a bare repository committed inside it (core.fsmonitor …).
const CLONES = /(?:^|\/)clones(?:\/|$)/;
// Longer commands are refused before parsing; every check below is linear, this only caps the worst case.
const MAX_COMMAND = 32_000;
// A for-loop word (after quote removal) is a plain path-like token: it may not start like a flag or a glob,
// and holds no $ [ ] ( ) quotes, spaces or shell syntax — bash re-evaluates a value in `$[f]`, `${a[$f]}` …
const LOOP_WORD = /^[A-Za-z0-9._/@%+:,=][A-Za-z0-9._/@%+:,=*?-]*$/;

// Splits on unquoted ; && || | & and newlines. Returns null on an unbalanced quote.
// A comment (`#` starting a word) and a heredoc / here-string (`<<`) are refused: bash reads a quote inside
// them as text, this parser would read it as a real quote and hide the rest of the command inside it.
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
    // A word starts after whitespace and after an operator (`cat a <#…`, `ls >#…`).
    if (c === '#' && (cur === '' || /[\s<>]$/.test(cur))) block('shell comments (#) are not allowed');
    if (c === '<' && cmd[i + 1] === '<') block('heredocs and here-strings (<<) are not allowed');
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

// The segment with only its shell syntax left: quoted text becomes `""` and a backslash-escaped character `_`,
// so `echo \' > f \'` shows its redirect and `grep 'a>b'` does not. (A regex over the raw text would read
// `\'` as an opening quote and hide everything up to the next one.)
function unquoted(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; out += '_'; continue; }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      i = end === -1 ? s.length : end;
      out += '""';
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1;
      i = j;
      out += '""';
      continue;
    }
    out += c;
  }
  return out;
}

// Shell words of one segment after quote removal, with the parameter expansions each holds
// (`$x`, `${x}`, `$1`, `$?`, `$'…'` …; none inside single quotes) and whether each sits inside "…".
// An expansion stays in `value` as \0.
// `bareBrace`: an unquoted { or } — brace expansion (`{-delete,x}`) would turn one word into a flag.
// `paren`: an unquoted ( or ) — with extglob `@(-delete)` is a pattern; without it a syntax error.
// `glob`: an unquoted * ? [; `globAtStart`: the word starts with one, so it can expand to a file named
// like a flag (`*` → `-delete`, `--pre=sh`); `flagGlob`: a flag holds one before any `=` (`-de*` → `-delete`).
// A backslash-newline is a line continuation, dropped as bash drops it (`-del\<newline>ete` = -delete).
// `$[` is bash's old arithmetic expansion; it never names a loop variable, so it is always refused.
const EXPANSION = /\$(?:\{([^}]*)\}|([A-Za-z_][A-Za-z0-9_]*)|([0-9?#@*!$-])|(['"])|(\[))/y;
function shellWords(seg) {
  const words = [];
  let cur = null;
  let quote = null;
  const word = () => (cur ??= { value: '', expansions: [], bareBrace: false, paren: false, glob: false, globAtStart: false, flagGlob: false });
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else word().value += c;
      continue;
    }
    if (c === '$') {
      EXPANSION.lastIndex = i;
      const m = EXPANSION.exec(seg);
      // Inside "…", `$'` and `$"` are a literal `$` and a quote character.
      if (m && !(quote === '"' && m[4])) {
        word().expansions.push({ name: m[1] ?? m[2] ?? m[3] ?? (m[4] ? `$${m[4]}` : '$['), quoted: quote === '"' });
        word().value += '\0';
        if (!m[4]) i += m[0].length - 1; // `$'…'`: the quote opens on the next character
        continue;
      }
      word().value += c;
      continue;
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && seg[i + 1] === '\n') i++;
      else if (c === '\\' && /[$`"\\]/.test(seg[i + 1] ?? '')) word().value += seg[++i];
      else word().value += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; word(); continue; }
    if (c === '\\') {
      const next = seg[++i];
      if (next !== undefined && next !== '\n') word().value += next;
      continue;
    }
    if (/\s/.test(c)) { if (cur) words.push(cur); cur = null; continue; }
    const w = word();
    if (c === '{' || c === '}') w.bareBrace = true;
    if (c === '(' || c === ')') w.paren = true;
    if (c === '*' || c === '?' || c === '[') {
      w.glob = true;
      if (w.value === '') w.globAtStart = true;
      else if (w.value.startsWith('-') && !w.value.includes('=')) w.flagGlob = true;
    }
    w.value += c;
  }
  if (cur) words.push(cur);
  return words;
}

// The subcommand of `git [-C <path>] [--no-pager] <sub> …` (the allowlist admits only those globals).
function gitSubcommand(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i].value === '-C') i++;
    else if (args[i].value !== '--no-pager') return args[i].value;
  }
  return null;
}

// `cd <dir>` / `git -C <dir>`: no server/clones/, no glob that could reach it (`server/clo*`), and a loop
// variable only when none of its words does either.
function checkWorkdir(w, loopVars, part) {
  const why = `"${part}": cd / git -C may not enter server/clones/ — imported repos are untrusted (their scripts and git config would run)`;
  if (CLONES.test(w.value) || w.glob) block(w.glob ? `a cd / git -C target may not hold a glob: "${part}"` : why);
  for (const x of w.expansions) {
    const loop = loopVars.get(x.name);
    if (loop && (loop.glob || loop.words.some((v) => CLONES.test(v)))) block(why);
  }
}

function checkBash(cmd) {
  const retro = profile === 'workflow-retro';
  const allowed = retro ? retroBash(root) : BASH[profile];
  if (allowed.length === 0) block('Bash is not available to this agent');
  if (cmd.length > MAX_COMMAND) block(`command longer than ${MAX_COMMAND} characters — split it`);
  // The SKILL.md commands spell the repo root as "$(git rev-parse --show-toplevel)/…" — the only substitution allowed.
  if (retro) cmd = cmd.replaceAll('$(git rev-parse --show-toplevel)', root);
  if (/\$\(|`/.test(cmd)) block('command substitution is not allowed');
  const parts = segments(cmd);
  if (!parts) block('unbalanced quotes in command');
  const loops = LOOP_PROFILES.has(profile);
  // `do <cmd>` and `timeout <N> <cmd>` are checked as <cmd> — every rule below applies to it. `for` and `done`
  // count only before any `timeout` (timeout runs a program, not a shell keyword), and a `for` head must be
  // followed by a segment starting with `do` — otherwise the guard would track a loop bash never opens.
  const DO = /^do(?:\s+|$)/;
  const stripTimeout = (p) => {
    while (/^timeout\s+\d+(?:\.\d+)?[smhd]?\s+\S/.test(p)) p = p.replace(/^timeout\s+\S+\s+/, '');
    return p;
  };
  // The only expansions allowed are the variables of the for-loops that enclose the segment (between
  // `for <name> in …` and its `done`). Loop words are plain tokens (LOOP_WORD), so `$f` can never become
  // `-exec`, `-i`, `--output` or code that bash evaluates. A glob loop word (`src/*`) yields real file names,
  // which may hold spaces (`a . -delete`): bash splits an unquoted `$f`, so such a variable must be "$f".
  const openLoops = []; // { name, glob, words }
  let expectDo = false;
  for (const part of parts) {
    const bare = unquoted(part);
    if (/[<>]\(/.test(bare)) block('process substitution is not allowed');
    // Only `N>&M` with digits and `/dev/null` as a whole word: bash reads `>&1x` as `&>1x` (a file). /dev/null
    // goes first, so removing `2>&1` cannot turn `>/dev/null2>&1` (a file /dev/null2) into a whole word.
    const rest = bare.replace(/(?:\d|&)?>>?\s*\/dev\/null(?=\s|$)/g, '').replace(/\d?>&\d+(?=\s|$)/g, '');
    if (rest.includes('>')) block(`shell write in "${part}" — this agent may not write files from Bash`);
    const head = loops ? part.replace(DO, '') : part;
    if (expectDo && !DO.test(part)) block(`a for-loop head must be followed by "do": "${part}"`);
    expectDo = false;
    if (loops && FOR_HEAD.test(unquoted(head))) {
      expectDo = true;
      const [, name, , ...items] = shellWords(head);
      // `$_` is bash's last argument of the previous command, not the loop word.
      if (name.value === '_') block(`"_" cannot be a for-loop variable: "${part}"`);
      for (const w of items) {
        if (w.expansions.length || w.bareBrace || w.paren || !LOOP_WORD.test(w.value)) {
          block(`for-loop word "${w.value}" must be a plain path or name (letters, digits, . _ / @ % + : , = - * ?; not starting with - * ?): "${part}"`);
        }
      }
      openLoops.push({ name: name.value, glob: items.some((w) => /[*?]/.test(w.value)), words: items.map((w) => w.value) });
      continue;
    }
    if (loops && DONE.test(head)) {
      openLoops.pop();
      continue;
    }
    const cmdPart = loops ? stripTimeout(head) : head;
    if (cmdPart !== head && (FOR_HEAD.test(unquoted(cmdPart)) || DONE.test(cmdPart) || DO.test(cmdPart))) {
      block(`timeout cannot run a shell keyword: "${part}"`);
    }
    if (loops && !cmdPart) continue;
    // An inner loop's variable shadows an outer one of the same name (later Map entries win).
    const loopVars = new Map(openLoops.map((l) => [l.name, l]));
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(cmdPart)) block(`env-var prefix in "${part}" is not allowed`);
    if (!allowed.some((re) => re.test(cmdPart))) block(`"${cmdPart.split(/\s+/).slice(0, 3).join(' ')}" is not on this agent's Bash allowlist`);
    const words = shellWords(cmdPart);
    const [cmdWord, ...argWords] = words;
    if (cmdWord.expansions.length) block(`the command name may not come from a variable: "${part}"`);
    if (!/^[a-z]+$/.test(cmdWord.value)) block(`the command must be a plain name, not a path: "${part}"`);
    for (const w of words) {
      for (const x of w.expansions) {
        const loop = loopVars.get(x.name);
        if (!loop) block(`"$${x.name}" is not allowed — only the variable of an enclosing for-loop may be expanded`);
        if (loop.glob && !x.quoted) block(`quote "$${x.name}": its for-loop words are globs and bash splits an unquoted file name on spaces: "${part}"`);
      }
      if (w.bareBrace) block(`brace expansion is not allowed — quote { and }: "${part}"`);
      if (w.paren) block(`unquoted ( ) is not allowed — quote it: "${part}"`);
      if (w.globAtStart) block(`a glob at the start of a word can expand to a file named like a flag — start it with a path (./${w.value}) or quote it: "${part}"`);
      if (w.flagGlob) block(`a flag may not hold an unquoted glob (it could expand to another flag): "${part}"`);
    }
    if (argWords.some((w) => w.value.startsWith('-') && w.expansions.length)) block(`a flag may not be built from a variable: "${part}"`);
    const sub = cmdWord.value === 'git' ? gitSubcommand(argWords) : null;
    const bad = FORBIDDEN_ARGS.find((r) => r.cmd.test(cmdWord.value) && (!r.sub || r.sub.test(sub ?? '')) && argWords.some((w) => r.arg.test(w.value)));
    if (bad) block(`${bad.why}: "${part}"`);
    checkCommandArgs(cmdWord.value, argWords, loopVars, part);
    if (retro && cmdWord.value === 'jq' && argWords.some((w) => JQ_FORBIDDEN.test(w.value))) {
      block(`a jq filter may not read the environment or load modules (env, $ENV, import, include): "${part}"`);
    }
  }
}

// Rules that depend on a word's position, not just on its text.
function checkCommandArgs(cmd, args, loopVars, part) {
  // The script is `sed -n <script>`: from a loop variable it could be `e` (run each line) or `w<file>`.
  if (cmd === 'sed' && args[1]?.expansions.length) block(`the sed script may not contain a $-expansion: "${part}"`);
  // `uniq IN OUT` writes OUT.
  if (cmd === 'uniq' && args.filter((w) => !w.value.startsWith('-')).length > 1) {
    block(`uniq writes its second file argument — give it one file or pipe into it (attach option values: -f1): "${part}"`);
  }
  if (cmd === 'cd') for (const w of args) checkWorkdir(w, loopVars, part);
  if (cmd === 'git') {
    for (let i = 0; i < args.length; i++) {
      if (args[i].value === '-C' && args[i + 1]) checkWorkdir(args[++i], loopVars, part);
      else if (args[i].value !== '--no-pager') break;
    }
  }
  if (!RUNNER.test(cmd)) return;
  // npm reads options before `--` as its own config (--script-shell, --prefix, --node-options …); pnpm and
  // npx hand everything after the script / binary name to it.
  if (cmd === 'npm') {
    const end = args.findIndex((w) => w.value === '--');
    if (args.slice(0, end === -1 ? args.length : end).some((w) => w.value.startsWith('-'))) {
      block(`npm options configure npm itself — pass test flags after "--" (npm test -- <flags>): "${part}"`);
    }
  }
  const next = (i) => args[i + 1]?.value ?? '';
  if (args.some((w, i) => w.value === '--reporter' && /^(?:html|blob)$/.test(next(i)))) block(`this vitest reporter writes files: "${part}"`);
  // A tsc boolean takes `true` / `false` as the next word: `--noEmit false` emits.
  if (args.some((w, i) => /^--noemit$/i.test(w.value) && /^false$/i.test(next(i)))) block(`tsc --noEmit false emits files: "${part}"`);
}

// The real path of `abs`: its deepest existing ancestor with symlinks resolved, plus the rest. A dangling
// symlink on the way is refused — a write would create its target, wherever that is.
function realPath(abs) {
  const rest = [];
  for (let p = abs; ; p = dirname(p)) {
    try {
      return join(realpathSync(p), ...rest);
    } catch {
      let link = false;
      try {
        link = lstatSync(p).isSymbolicLink();
      } catch {
        /* p does not exist */
      }
      if (link) block(`"${p}" is a dangling symlink`);
      if (dirname(p) === p) return abs;
      rest.unshift(basename(p));
    }
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
  // This runs on every tool call for the rest of the session and transcripts reach tens of MB: search the raw
  // bytes and decode only the lines of this prompt that look like a human entry (UTF-8 decoding the whole
  // file cost ~65 ms on a 28 MB transcript).
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    return true;
  }
  const needle = Buffer.from(`"promptId":"${id}"`);
  const human = Buffer.from('"human"');
  let seen = false;
  for (let i = buf.indexOf(needle), end = 0; i !== -1; i = buf.indexOf(needle, end)) {
    const start = buf.lastIndexOf(10, i) + 1;
    const nl = buf.indexOf(10, i);
    end = nl === -1 ? buf.length : nl;
    if (buf.subarray(start, end).indexOf(human) === -1) continue;
    let entry;
    try {
      entry = JSON.parse(buf.toString('utf8', start, end));
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
  // A file named like a flag, or with spaces (`x . -delete`), would turn into flags in a later Bash call
  // through a glob or a split loop variable.
  if (rel.split('/').some((seg) => seg.startsWith('-') || /[\s\p{Cc}]/u.test(seg))) {
    block(`"${rel}": a path segment may not start with "-" or hold spaces / control characters`);
  }
  if (!WRITE_PATHS[profile].some((re) => re.test(rel))) {
    block(WRITE_PATHS[profile].length ? `"${rel}" is outside the paths this agent may write` : 'this agent is read-only');
  }
  // A symlink inside an allowed folder (server/test/x → ../src) must not carry the write elsewhere.
  const realRel = relative(realPath(root), realPath(resolve(root, rel))).split(sep).join('/');
  if (realRel !== rel && (realRel.startsWith('..') || !WRITE_PATHS[profile].some((re) => re.test(realRel)))) {
    block(`"${rel}" resolves through a symlink to "${realRel}", outside the paths this agent may write`);
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
