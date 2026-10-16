// Shared helpers for the pr-self-review skill. Zero dependencies (Node >= 22).
// Pure functions (routing, severity, verdict, hook decisions) sit on top; git I/O below them.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, lstatSync, readlinkSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot, packageOf } from '../../engineering-insights/scripts/lib.mjs';

export { repoRoot, packageOf };

export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const SKILL_MD = '.claude/skills/pr-self-review/SKILL.md';
export const HOOKS_PATH = '.githooks';
export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
export const DELETED = 'deleted';
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export const ZERO_SHA = /^0+$/;

// ---------------------------------------------------------------- routing (pure)

const escapeRe = (s) => s.replace(/[.+^${}()|[\]\\*?]/g, '\\$&');
const globCache = new Map();

/** Minimal glob → RegExp: `**` any depth, `*` one segment, `?` one char, `{a,b}` literal alternatives. */
export function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob);
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{' && glob.indexOf('}', i) > i) {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map(escapeRe).join('|')})`;
      i = end;
    } else {
      re += escapeRe(c);
    }
  }
  const out = new RegExp(`^${re}$`);
  globCache.set(glob, out);
  return out;
}

export const matchesAny = (path, globs = []) => globs.some((g) => globToRegExp(g).test(path));

export function loadRouting(dir = SKILL_DIR) {
  return JSON.parse(readFileSync(join(dir, 'routing.json'), 'utf8'));
}

/** Excluded files are neither reviewed nor checked by the git hooks. */
export const isExcluded = (path, routing) => matchesAny(path, routing.exclude);

export const ruleOf = (skill, routing) => routing.skills.find((r) => r.skill === skill);

/**
 * Skills that review `path`. A rule matches on `include` (+ `contains`, if set), or on any of its
 * `alsoWhen` triggers ({ include, contains }); `exclude` always wins. `getText(path)` returns the
 * file's diff and current content; it is called lazily, only for triggers with `contains`.
 */
export function skillsFor(path, routing, getText = () => '') {
  const hit = (t) =>
    matchesAny(path, t.include) && (!t.contains?.length || t.contains.some((p) => new RegExp(p).test(getText(path))));
  return routing.skills
    .filter((r) => !matchesAny(path, r.exclude) && (hit(r) || (r.alsoWhen ?? []).some(hit)))
    .map((r) => r.skill);
}

/** Installed skills that have neither a route nor an ignore entry — the routing table is behind. */
export function unroutedSkills(discovered, routing) {
  const known = new Set([...routing.skills.map((r) => r.skill), ...(routing.ignoreSkills ?? [])]);
  return discovered.filter((s) => !known.has(s.name));
}

/**
 * Review plan from the working changes. `changes`: [{ path, status, hash, added, deleted }].
 * Every non-excluded file lands in `files` (and later in the marker), routed or not.
 */
export function buildPlan({ base, changes, routing, discovered = [], getText, root = '/' }) {
  const files = [];
  const excludedFiles = [];
  const buckets = {};
  for (const c of changes) {
    if (isExcluded(c.path, routing)) {
      excludedFiles.push(c.path);
      continue;
    }
    const skills = skillsFor(c.path, routing, getText);
    files.push({ ...c, package: packageOf(c.path, root), skills });
    for (const s of skills) (buckets[s] ??= []).push(c.path);
  }
  const lines = (paths) =>
    files.filter((f) => paths.includes(f.path)).reduce((n, f) => n + (f.added ?? 0) + (f.deleted ?? 0), 0);
  return {
    version: 1,
    base,
    empty: files.length === 0,
    files,
    buckets,
    bucketLines: Object.fromEntries(Object.entries(buckets).map(([s, p]) => [s, lines(p)])),
    totalLines: lines(files.map((f) => f.path)),
    unreviewedFiles: files.filter((f) => f.skills.length === 0).map((f) => f.path),
    excludedFiles,
    unroutedSkills: unroutedSkills(discovered, routing),
    checks: { typecheck: typecheckTargets(files), depcruise: depcruiseTargets(files).map((t) => t.name) },
  };
}

// ---------------------------------------------------------------- severity & verdict (pure)

const DEFAULT_SEVERITY_MAP = {
  CRITICAL: 'CRITICAL',
  HIGH: 'WARNING',
  WARNING: 'WARNING',
  MEDIUM: 'SUGGESTION',
  LOW: 'SUGGESTION',
  SUGGESTION: 'SUGGESTION',
  INFO: 'SUGGESTION',
};

/** Skill's own scale → CRITICAL | WARNING | SUGGESTION; advisory skills are capped at WARNING. */
export function normalizeSeverity(raw, rule) {
  const sev = { ...DEFAULT_SEVERITY_MAP, ...(rule?.severityMap ?? {}) }[String(raw ?? '').toUpperCase()];
  if (!sev) return null;
  return rule?.mode === 'advisory' && sev === 'CRITICAL' ? 'WARNING' : sev;
}

const EVIDENCE = /\S+:\d+/;

/** Validate one findings file against its bucket. Returns { findings, errors }. */
export function validateFindings(doc, { skill, files, rule }) {
  const errors = [];
  const where = `findings/${skill}.json`;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { findings: [], errors: [`${where}: expected an object { skill, findings: [] }`] };
  if (doc.skill !== skill) errors.push(`${where}: "skill" must be "${skill}", got ${JSON.stringify(doc.skill)}`);
  if (!Array.isArray(doc.findings)) return { findings: [], errors: [...errors, `${where}: "findings" must be an array`] };
  const findings = [];
  doc.findings.forEach((f, i) => {
    const at = `${where} #${i + 1}`;
    const severity = normalizeSeverity(f?.severity, rule);
    if (!severity) return errors.push(`${at}: unknown severity ${JSON.stringify(f?.severity)}`);
    if (typeof f.title !== 'string' || !f.title.trim()) return errors.push(`${at}: "title" is required`);
    if (!files.includes(f.file)) return errors.push(`${at}: "file" ${JSON.stringify(f.file)} is not in this skill's bucket`);
    if (f.line != null && !(Number.isInteger(f.line) && f.line > 0)) return errors.push(`${at}: "line" must be a positive integer`);
    if (severity === 'CRITICAL' && !(Number.isInteger(f.line) && EVIDENCE.test(f.evidence ?? ''))) {
      return errors.push(`${at}: a CRITICAL needs "line" and "evidence" with path:line — add them, do not lower the severity`);
    }
    findings.push({
      skill,
      file: f.file,
      line: f.line ?? null,
      severity,
      title: f.title.trim(),
      rule: f.rule ?? null,
      evidence: f.evidence ?? null,
      fix: f.fix ?? null,
    });
  });
  return { findings, errors };
}

const rank = (s) => SEVERITIES.indexOf(s);

/** Findings produced by tools rather than reviewers (see checks.mjs). */
export const DETERMINISTIC = new Set(['typecheck', 'dependency-cruiser']);

/**
 * Merge duplicates (same file, line and title) keeping the highest severity; sort most severe first.
 * A reviewer finding on a line that a deterministic check already flagged joins that finding: the
 * tool's title and severity win, so the same problem is never counted twice; the reviewer's title is
 * kept in `related` in case it describes something else on that line.
 */
export function dedupeFindings(findings) {
  const byKey = new Map();
  const byLine = new Map();
  for (const f of findings.filter((x) => DETERMINISTIC.has(x.skill))) {
    const key = `${f.file}:${f.line ?? ''}:${f.title.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, { ...f, skills: [f.skill] });
    byLine.set(`${f.file}:${f.line}`, byKey.get(key));
  }
  for (const f of findings.filter((x) => !DETERMINISTIC.has(x.skill))) {
    const tool = f.line != null && byLine.get(`${f.file}:${f.line}`);
    if (tool) {
      if (!tool.skills.includes(f.skill)) tool.skills.push(f.skill);
      (tool.related ??= []).push(`${f.skill}: ${f.title}`);
      continue;
    }
    const key = `${f.file}:${f.line ?? ''}:${f.title.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...f, skills: [f.skill] });
    else {
      prev.skills.push(f.skill);
      if (rank(f.severity) < rank(prev.severity)) Object.assign(prev, { ...f, skills: prev.skills });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
  );
}

export function decideVerdict(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  return { verdict: counts.CRITICAL > 0 ? 'BLOCKED' : 'PASS', counts };
}

/** Marker = what was reviewed (path → content hash) and the outcome. */
export function buildMarker(plan, findings, at = new Date().toISOString(), checks = []) {
  const { verdict, counts } = decideVerdict(findings);
  return {
    version: 1,
    verdict,
    base: plan.base,
    at,
    files: Object.fromEntries(plan.files.map((f) => [f.path, f.hash])),
    skills: Object.keys(plan.buckets),
    checks,
    counts,
    findings,
  };
}

// ---------------------------------------------------------------- deterministic checks (pure)

const TS_SOURCE = /\.(ts|tsx|mts|cts)$/;
const TS_SETUP = /(^|\/)(tsconfig[^/]*\.json|package\.json)$/;
export const TYPECHECK_PACKAGES = ['server', 'client', 'reviewer-core', 'e2e'];

/** Packages to typecheck. server and reviewer-core share code through path aliases, so either pulls in both. */
export function typecheckTargets(files) {
  const pkgs = new Set();
  for (const { path } of files) {
    const pkg = path.split('/')[0];
    if (TYPECHECK_PACKAGES.includes(pkg) && (TS_SOURCE.test(path) || TS_SETUP.test(path))) pkgs.add(pkg);
  }
  if (pkgs.has('server') || pkgs.has('reviewer-core')) ['server', 'reviewer-core'].forEach((p) => pkgs.add(p));
  return [...pkgs].sort();
}

const TSC_ERROR = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/;

/** `tsc` output → CRITICAL findings. tsc prints paths relative to the package directory. */
export function parseTscOutput(out, pkg) {
  return out.split('\n').flatMap((l) => {
    const m = l.match(TSC_ERROR);
    if (!m) return [];
    const file = posix.normalize(`${pkg}/${m[1]}`);
    return [{
      skill: 'typecheck',
      file,
      line: Number(m[2]),
      severity: 'CRITICAL',
      title: `${m[3]}: ${m[4].trim()}`,
      rule: `tsc --noEmit must pass in ${pkg}/`,
      evidence: `${file}:${m[2]}`,
      fix: null,
    }];
  });
}

/** dependency-cruiser runs: configs live as code blocks in the onion-architecture skill. */
export const DEPCRUISE_TARGETS = [
  { name: 'server', heading: 'Server rules', cwd: 'server', src: 'src', include: ['server/src/**/*.{ts,tsx,mts}'] },
  { name: 'reviewer-core', heading: 'reviewer-core rule', cwd: 'server', src: '../reviewer-core/src', include: ['reviewer-core/src/**/*.{ts,tsx,mts}'] },
];
export const ENFORCEMENT_MD = '.claude/skills/onion-architecture/references/enforcement.md';

export const depcruiseTargets = (files) =>
  DEPCRUISE_TARGETS.filter((t) => files.some((f) => f.hash !== DELETED && matchesAny(f.path, t.include)));

/** First ```js block under the `## <heading…>` section of a markdown document, or null. */
export function extractJsBlock(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
  if (start === -1) return null;
  const open = lines.findIndex((l, i) => i > start && l.startsWith('```js'));
  const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
  if (open === -1 || close === -1 || lines.slice(start + 1, open).some((l) => l.startsWith('## '))) return null;
  return lines.slice(open + 1, close).join('\n') + '\n';
}

// `unresolvedTo` is the import specifier as written, so it is stable across checkouts; resolved
// `to` paths are not (node_modules symlinks, worktree depth).
const violationKey = (v) => `${v.from}\0${v.rule?.name}\0${v.unresolvedTo ?? v.to}`;

/** Violations the baseline lacks, limited to changed files. `from` is relative to `cwd`. */
export function newViolations({ baseline, current, cwd, changed }) {
  const known = new Set(baseline.map(violationKey));
  const wanted = new Set(changed);
  return current
    .filter((v) => !known.has(violationKey(v)))
    .map((v) => ({ ...v, file: posix.normalize(`${cwd}/${v.from}`) }))
    .filter((v) => wanted.has(v.file));
}

/** 1-based line of the first import of `specifier` in `text`, or null. */
export function importLine(text, specifier) {
  const i = text.split('\n').findIndex((l) => l.includes(`'${specifier}'`) || l.includes(`"${specifier}"`));
  return i === -1 ? null : i + 1;
}

export function violationFinding(v, line) {
  const spec = v.unresolvedTo ?? v.to;
  return {
    skill: 'dependency-cruiser',
    file: v.file,
    line: line ?? 1,
    severity: 'CRITICAL',
    title: `New dependency-rule violation ${v.rule?.name}: imports ${spec}`,
    rule: `${v.rule?.name} (onion-architecture, ${ENFORCEMENT_MD})`,
    evidence: `${v.file}:${line ?? 1} — import '${spec}'`,
    fix: 'Follow the onion-architecture skill: move the dependency behind the module port / repository.',
  };
}

/** Plan files whose content changed between collect and verdict (or appeared/disappeared). */
export function driftedFiles(plan, current, routing) {
  const now = new Map(current.filter((c) => !isExcluded(c.path, routing)).map((c) => [c.path, c.hash]));
  const drift = plan.files.filter((f) => now.get(f.path) !== f.hash).map((f) => f.path);
  const planned = new Set(plan.files.map((f) => f.path));
  for (const p of now.keys()) if (!planned.has(p)) drift.push(p);
  return drift;
}

// ---------------------------------------------------------------- hook decisions (pure)

const ok = (reason, details = []) => ({ ok: true, reason, details });
const fail = (reason, details = [], hint = []) => ({ ok: false, reason, details, hint });
const criticalLines = (marker) =>
  (marker.findings ?? []).filter((f) => f.severity === 'CRITICAL').map((f) => `${f.file}:${f.line} — ${f.title} [${f.skill}]`);

/** pre-commit: every reviewable staged file must match the marker, and the marker must be PASS. */
export function evaluateCommit({ marker, staged, routing }) {
  const reviewable = staged.filter((s) => !isExcluded(s.path, routing));
  if (!reviewable.length) return ok('no reviewable files staged');
  if (!marker) return fail('no review found for the staged changes', reviewable.map((s) => s.path));
  const stale = reviewable.filter((s) => marker.files?.[s.path] !== s.hash).map((s) => s.path);
  if (stale.length) return fail('staged changes were not reviewed (edited after the last review, or never reviewed)', stale);
  if (marker.verdict !== 'PASS') {
    return fail('the last review is BLOCKED — fix the CRITICAL findings, then re-run the review', criticalLines(marker));
  }
  return ok(`reviewed ${reviewable.length} file(s), verdict PASS`);
}

/**
 * pre-push / pr-merge: every non-merge commit that touches a reviewable file must be approved.
 * `commits` newest first: [{ sha, patchId | null, files: [] }].
 */
export function evaluateCommits({ commits, approved, routing }) {
  const bad = commits.filter(
    (c) => c.patchId && !approved.has(c.patchId) && c.files.some((f) => !isExcluded(f, routing)),
  );
  if (!bad.length) return ok(`${commits.length} commit(s) checked, all reviewed`);
  const oldest = bad[bad.length - 1].sha.slice(0, 12);
  return fail(
    `${bad.length} commit(s) were not approved by the PR self-review (committed with --no-verify, before the hooks were enabled, or changed by a rebase)`,
    bad.map((c) => c.sha.slice(0, 12)),
    [
      `To review them: \`git reset --soft ${oldest}~1\` (keeps the changes staged), run the review, commit again.`,
      'Commits from before the hooks were enabled: a human may run `node .claude/skills/pr-self-review/scripts/check.mjs approve-existing`.',
    ],
  );
}

/** pr-merge: the PR head must be the reviewed local HEAD. */
export function evaluatePrHead({ prHead, localHead }) {
  if (prHead === localHead) return ok('PR head matches the local HEAD');
  return fail('the PR head is not your local HEAD, so it is not what was reviewed', [`PR head ${prHead.slice(0, 12)}`, `local HEAD ${localHead.slice(0, 12)}`], [
    'Check out the PR branch, pull, run the review and push before merging.',
  ]);
}

/** Text a hook prints when it blocks — written as an instruction, because agents read it. */
export function formatBlock(result, { mode }) {
  const lines = [`✖ PR self-review (${mode}): ${result.reason}`];
  for (const d of result.details ?? []) lines.push(`    ${d}`);
  for (const h of result.hint ?? []) lines.push(`  → ${h}`);
  lines.push(`  → Read and follow ${SKILL_MD}, then retry.`);
  lines.push('  → Do not use --no-verify or PR_SELF_REVIEW_SKIP to get past this.');
  return lines.join('\n');
}

// ---------------------------------------------------------------- git I/O

export function git(args, { root = repoRoot(), input, allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      input,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

export const headOrEmpty = (root) => git(['rev-parse', '--verify', '-q', 'HEAD'], { root, allowFail: true })?.trim() || EMPTY_TREE;
export const headSha = (root) => git(['rev-parse', '--verify', '-q', 'HEAD'], { root, allowFail: true })?.trim() || null;
export const gitDir = (root) => git(['rev-parse', '--absolute-git-dir'], { root }).trim();
export const stateDir = (root) => join(gitDir(root), 'pr-self-review');

/** Parse `--name-status -z --no-renames` output into [{ status, path }]. */
export function parseNameStatus(out) {
  const parts = out.split('\0');
  const res = [];
  for (let i = 0; i + 1 < parts.length; i += 2) if (parts[i]) res.push({ status: parts[i][0], path: parts[i + 1] });
  return res;
}

/** Content hashes of working-tree files, as `git add` would store them (symlinks hash their target text). */
export function hashWorkingFiles(paths, root) {
  const out = new Map();
  const regular = [];
  for (const p of paths) {
    const abs = join(root, p);
    if (!existsSync(abs) && !isSymlink(abs)) out.set(p, DELETED);
    else if (isSymlink(abs)) out.set(p, git(['hash-object', '--stdin'], { root, input: readlinkSync(abs) }).trim());
    else regular.push(p);
  }
  if (regular.length) {
    const hashes = git(['hash-object', '--stdin-paths'], { root, input: regular.join('\n') + '\n' }).trim().split('\n');
    regular.forEach((p, i) => out.set(p, hashes[i]));
  }
  return out;
}

function isSymlink(abs) {
  try {
    return lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}

function countLines(abs) {
  try {
    const text = readFileSync(abs, 'utf8');
    return text ? text.split('\n').length : 0;
  } catch {
    return 0;
  }
}

/** Uncommitted changes: staged + unstaged (vs HEAD) + untracked, with hashes and line counts. */
export function workingChanges(root) {
  const head = headOrEmpty(root);
  const tracked = parseNameStatus(git(['diff', '--name-status', '-z', '--no-renames', head], { root }));
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { root })
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ status: '?', path }));
  const stats = new Map();
  for (const rec of git(['diff', '--numstat', '-z', '--no-renames', head], { root }).split('\0')) {
    const [a, d, ...rest] = rec.split('\t');
    if (rest.length) stats.set(rest.join('\t'), { added: Number(a) || 0, deleted: Number(d) || 0 });
  }
  const all = [...tracked, ...untracked];
  const hashes = hashWorkingFiles(all.map((c) => c.path), root);
  return all.map((c) => ({
    ...c,
    hash: c.status === 'D' ? DELETED : hashes.get(c.path),
    ...(stats.get(c.path) ?? { added: c.status === '?' ? countLines(join(root, c.path)) : 0, deleted: 0 }),
  }));
}

/** Routing text of one changed file: its diff vs HEAD plus its current content (empty when deleted). */
export function fileText(path, root) {
  const diff = git(['diff', '--no-color', headOrEmpty(root), '--', path], { root, allowFail: true }) ?? '';
  let content = '';
  try {
    content = readFileSync(join(root, path), 'utf8');
  } catch {
    // deleted — the diff alone carries the removed lines
  }
  return `${diff}\n${content}`;
}

/** Staged changes (honours GIT_INDEX_FILE, so `git commit -a` and `git commit <paths>` work). */
export function stagedChanges(root) {
  const changed = parseNameStatus(git(['diff', '--cached', '--name-status', '-z', '--no-renames', headOrEmpty(root)], { root }));
  if (!changed.length) return [];
  const index = new Map();
  for (const rec of git(['ls-files', '--stage', '-z'], { root }).split('\0')) {
    const tab = rec.indexOf('\t');
    if (tab > 0) index.set(rec.slice(tab + 1), rec.slice(0, tab).split(' ')[1]);
  }
  return changed.map((c) => ({ ...c, hash: c.status === 'D' ? DELETED : index.get(c.path) ?? DELETED }));
}

/** merge / rebase / cherry-pick / revert in progress — pre-commit stays out of the way. */
export function operationInProgress(root) {
  const dir = gitDir(root);
  return ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'].find((f) => existsSync(join(dir, f))) ?? null;
}

/** Non-merge commits of a rev-list range with their patch-ids and touched files, newest first. */
export function commitsIn(rangeArgs, root) {
  const shas = (git(['rev-list', '--no-merges', ...rangeArgs], { root }) ?? '').split('\n').filter(Boolean);
  if (!shas.length) return [];
  const patch = git(['log', '--no-walk=unsorted', '-p', '--no-color', '--no-ext-diff', '--no-renames', '--format=commit %H', ...shas], { root });
  const ids = new Map();
  for (const line of git(['patch-id', '--stable'], { root, input: patch }).split('\n')) {
    const [pid, sha] = line.split(' ');
    if (sha) ids.set(sha, pid);
  }
  const files = new Map();
  let cur = null;
  for (const line of git(['log', '--no-walk=unsorted', '--name-only', '--no-renames', '--format=@@%H', ...shas], { root }).split('\n')) {
    if (line.startsWith('@@')) files.set((cur = line.slice(2)), []);
    else if (line && cur) files.get(cur).push(line);
  }
  return shas.map((sha) => ({ sha, patchId: ids.get(sha) ?? null, files: files.get(sha) ?? [] }));
}

export const commitExists = (sha, root) => git(['cat-file', '-e', `${sha}^{commit}`], { root, allowFail: true }) !== null;

/** Default branch on origin, e.g. `origin/main`. */
export function defaultRemoteBranch(root) {
  return git(['rev-parse', '--abbrev-ref', 'origin/HEAD'], { root, allowFail: true })?.trim() || 'origin/main';
}

export const hooksEnabled = (root) => git(['config', '--get', 'core.hooksPath'], { root, allowFail: true })?.trim() === HOOKS_PATH;

// ---------------------------------------------------------------- state files (.git/pr-self-review/)

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export const readMarker = (root) => readJson(join(stateDir(root), 'result.json'));

export function writeMarker(marker, root) {
  mkdirSync(stateDir(root), { recursive: true });
  writeFileSync(join(stateDir(root), 'result.json'), JSON.stringify(marker, null, 2) + '\n');
}

export function readApproved(root) {
  const file = join(stateDir(root), 'approved');
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, 'utf8').split('\n').map((l) => l.split(' ')[0]).filter(Boolean));
}

export function appendApproved(entries, root) {
  if (!entries.length) return;
  mkdirSync(stateDir(root), { recursive: true });
  appendFileSync(join(stateDir(root), 'approved'), entries.map((e) => `${e.patchId} ${e.sha} ${e.via}\n`).join(''));
}

export const readPending = (root) => readJson(join(stateDir(root), 'pending.json'));

export function writePending(tree, root) {
  mkdirSync(stateDir(root), { recursive: true });
  writeFileSync(join(stateDir(root), 'pending.json'), JSON.stringify({ tree, at: new Date().toISOString() }) + '\n');
}

export const clearPending = (root) => rmSync(join(stateDir(root), 'pending.json'), { force: true });

export function logSkip(mode, root) {
  mkdirSync(stateDir(root), { recursive: true });
  appendFileSync(join(stateDir(root), 'skipped.log'), `${new Date().toISOString()} ${mode} HEAD=${headSha(root) ?? '-'}\n`);
}

// ---------------------------------------------------------------- skills discovery

/** Installed skills from `.claude/skills/*\/SKILL.md` frontmatter: [{ name, description }]. */
export function discoverSkills(root) {
  const dir = join(root, '.claude', 'skills');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const fm = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const field = (k) => fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
    out.push({ name: field('name') || entry.name, description: field('description') });
  }
  return out;
}
