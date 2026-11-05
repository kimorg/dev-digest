// Shared detection of file writes made from a shell command. Used by implementer-guard.mjs (blocks
// content writes into the repo) and implementer-verify.mjs (a write-ish command means the transcript's
// Edit/Write list is incomplete, so git status is consulted too). Heuristic by design: the guard is a
// backstop for the prompt rule "change files with Edit/Write", not a sandbox.
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';

const TMP_ROOTS = [...new Set([resolve(tmpdir()), '/tmp'])];
const SAFE_TARGETS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr']);

// Heredoc bodies may contain `>` (arrow functions, JSX, comparisons) — drop them, keep the first line.
function stripHeredocBodies(cmd) {
  const lines = cmd.split('\n');
  const out = [];
  let end = null;
  for (const line of lines) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    out.push(line);
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/);
    if (m) end = m[2];
  }
  return out.join('\n');
}

// Quoted strings are arguments (grep patterns, awk programs), not redirects.
const unquote = (s) => s.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""');

const isTmpTarget = (t) =>
  /^\$\{?TMPDIR\}?(?:\/|$)/.test(t) || (t.startsWith('/') && TMP_ROOTS.some((r) => resolve(t) === r || resolve(t).startsWith(r + sep)));

function outsideTmp(target) {
  if (!target || SAFE_TARGETS.has(target)) return false;
  return !isTmpTarget(target);
}

const INLINE_INTERPRETER = [
  // python3 - <<'EOF' · python3 -c "…" · node -e / --eval / -p · perl -e · ruby -e · bun/deno eval
  /\b(?:python3?|node|perl|ruby|bun|deno)\b[^|;&\n]*?\s(?:-c|-e|-p|-E|--eval|--print|eval)(?=\s|=|$)/,
  /\b(?:python3?|node|perl|ruby)\s+-(?=\s|$)/,
  /\b(?:python3?|node|perl|ruby)\s*<</,
];
// Running a script the agent stored in a temp dir (Write → /tmp/x.py → python3 /tmp/x.py).
const TMP_SCRIPT = /\b(?:python3?|node|perl|ruby|bash|sh|zsh|tsx)\s+(?:[^\s|;&]+\s+)*?(?:\/tmp\/|\$\{?TMPDIR\}?)/;

/** Why `cmd` writes file content outside a temp dir, or null. */
export function shellWriteReason(cmd) {
  const s = unquote(stripHeredocBodies(String(cmd)));
  for (const m of s.matchAll(/(?:^|[^<>=\-0-9&])(?:\d|&)?>{1,2}\|?(?!&)\s*([^\s;&|<>()]+)/g)) {
    if (outsideTmp(m[1])) return `shell redirect into "${m[1]}"`;
  }
  for (const m of s.matchAll(/\btee\b((?:\s+-[a-zA-Z]+)*)((?:\s+[^\s;&|<>-][^\s;&|<>]*)+)/g)) {
    const target = m[2].trim().split(/\s+/).find(outsideTmp);
    if (target) return `tee into "${target}"`;
  }
  if (/\bsed\s+(?:-[a-zA-Z]*i|--in-place)/.test(s)) return 'sed -i (in-place edit)';
  if (/\bperl\s+-[a-zA-Z]*i/.test(s)) return 'perl -i (in-place edit)';
  if (INLINE_INTERPRETER.some((re) => re.test(s))) return 'an inline interpreter script (python -c / python - <<EOF / node -e …)';
  if (TMP_SCRIPT.test(s)) return 'a script run from a temp dir';
  return null;
}

/** Why `cmd` deletes recursively (rm -r / -R / -rf / --recursive), or null. Single-file rm is fine. */
export function recursiveDeleteReason(cmd) {
  const s = unquote(stripHeredocBodies(String(cmd)));
  const m = s.match(/\brm[ \t]+(?:[^\s;&|]+[ \t]+)*?(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(?=\s|$)/);
  return m ? `recursive delete "rm ${m[1]}"` : null;
}

/** True when `cmd` may have created, changed, moved or deleted files (coarser than shellWriteReason). */
export function mayWriteFiles(cmd) {
  if (shellWriteReason(cmd)) return true;
  const s = unquote(stripHeredocBodies(String(cmd)));
  return /\b(?:rm|mv|cp|ln|truncate|install)\s|\bgit\s+mv\b/.test(s);
}
