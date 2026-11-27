#!/usr/bin/env node
// Eval suggestion behind the git hooks — informational only, it never blocks (always exit 0).
//   eval-suggest.mjs commit          .githooks/post-commit  files of the commit just made (HEAD)
//   eval-suggest.mjs push            .githooks/pre-push     files of every outgoing commit (refs on stdin)
//   eval-suggest.mjs files <path>…   manual check of the mapping for the given paths
// Mapping mirrors the "Which change → which eval run" table in the root AGENTS.md — keep them in sync.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const ZERO_SHA = /^0+$/;
const err = (s) => process.stderr.write(s + '\n');

function git(args, root) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}
function commitExists(sha, root) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);

function commitFiles(root) {
  // A merge is diffed against its first parent; the root commit against the empty tree.
  const hasParent = git(['rev-parse', '-q', '--verify', 'HEAD^1'], root).trim() !== '';
  return lines(
    hasParent
      ? git(['diff', '--name-only', 'HEAD^1', 'HEAD'], root)
      : git(['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', 'HEAD'], root),
  );
}

function pushFiles(root) {
  // stdin: "<local ref> <local sha> <remote ref> <remote sha>" per pushed ref (same range as pr-self-review).
  let input = '';
  try {
    input = readFileSync(0, 'utf8');
  } catch {
    // no stdin — nothing to push
  }
  const files = [];
  for (const line of lines(input)) {
    const [, localSha, , remoteSha] = line.split(' ');
    if (!localSha || ZERO_SHA.test(localSha)) continue; // branch deletion
    const range = [localSha, '--not', '--remotes'];
    if (remoteSha && !ZERO_SHA.test(remoteSha) && commitExists(remoteSha, root)) range.push(remoteSha);
    files.push(...lines(git(['log', '--format=', '--name-only', ...range], root)));
  }
  return files;
}

/** Pure mapping: changed paths → which harness artifacts were touched. */
export function classify(paths) {
  const skills = new Set();
  const agents = new Set();
  const instructions = new Set();
  for (const p of new Set(paths)) {
    if (p.startsWith('server/clones/')) continue; // runtime data, never ours
    const skill = p.match(/^\.claude\/skills\/([^/]+)\/./);
    if (skill) skills.add(skill[1]);
    const agent = p.match(/^\.claude\/agents\/([^/]+)\.md$/);
    if (agent && agent[1] !== 'README') agents.add(agent[1]);
    if (['AGENTS.md', 'CLAUDE.md'].includes(basename(p))) instructions.add(p);
  }
  return { skills: [...skills].sort(), agents: [...agents].sort(), instructions: [...instructions].sort() };
}

export function render({ skills, agents, instructions }, hasEvals, mode) {
  if (!skills.length && !agents.length && !instructions.length) return '';
  const out = [`ℹ eval suggestion (${mode}): harness files changed — consider running, from evals/:`];
  const scaffold = [];
  const quick = [];
  if (skills.length) {
    out.push(`    pnpm eval:quality && pnpm eval:skills   # skills: ${skills.join(', ')}`);
    for (const s of skills) (hasEvals('skills', s) ? quick.push(`skills/${s}`) : scaffold.push(`pnpm eval:scaffold ${s}`));
  }
  if (agents.length) {
    out.push(`    pnpm eval:agents                        # agents: ${agents.join(', ')}`);
    for (const a of agents) (hasEvals('agents', a) ? quick.push(`agents/${a}`) : scaffold.push(`pnpm eval:scaffold --agent ${a}`));
  }
  if (instructions.length) out.push(`    pnpm eval:workflow                      # ${instructions.join(', ')}`);
  if (quick.length) out.push(`  Only the changed ones: pnpm vitest run ${quick.join(' ')}`);
  if (scaffold.length) out.push(`  No evals yet — scaffold them: ${scaffold.join(' · ')}`);
  out.push('  Optional: model-backed runs spend Claude Code subscription usage. Map: AGENTS.md › "Which change → which eval run".');
  return out.join('\n');
}

// realpath + pathToFileURL: Node resolves the main module through symlinks and percent-encodes
// `#` / `?`, so a hand-built `file://` URL would not match and the hook would print nothing.
const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  try {
    const [mode, ...rest] = process.argv.slice(2);
    const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim() || process.cwd();
    const paths = mode === 'commit' ? commitFiles(root) : mode === 'push' ? pushFiles(root) : mode === 'files' ? rest : null;
    if (!paths) {
      err('usage: eval-suggest.mjs <commit|push|files <path>…>');
    } else {
      const hasEvals = (kind, name) => existsSync(join(root, 'evals', kind, name));
      const text = render(classify(paths), hasEvals, mode);
      if (text) err(text);
    }
  } catch (e) {
    err(`eval-suggest: skipped (${e.message})`); // a suggestion must never break a commit or push
  }
  process.exit(0);
}
