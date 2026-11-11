// Allow/deny cases for agent-guard.mjs per profile. Run: node --test .claude/hooks/agent-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const guard = join(dirname(fileURLToPath(import.meta.url)), 'agent-guard.mjs');
const root = '/repo';

function run(profile, tool, toolInput, cwd = root) {
  const r = spawnSync('node', [guard, profile], {
    input: JSON.stringify({ tool_name: tool, tool_input: toolInput, cwd }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    encoding: 'utf8',
  });
  return { code: r.status, stderr: r.stderr };
}
const write = (profile, path) => run(profile, 'Write', { file_path: path.startsWith('/') ? path : `${root}/${path}` }).code;
const bash = (profile, command) => run(profile, 'Bash', { command }).code;

test('fails closed on unknown profile and bad input', () => {
  assert.equal(write('nope', 'server/test/a.test.ts'), 2);
  const r = spawnSync('node', [guard, 'readonly'], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('test-writer writes only tests, helpers and e2e flows', () => {
  for (const p of [
    'server/test/foo.test.ts', 'server/test/foo.it.test.ts', 'server/test/helpers/pg.ts',
    'server/src/modules/x/domain.test.ts', 'client/src/app/_components/A/A.test.tsx',
    'client/src/lib/hooks/runs.test.tsx', 'reviewer-core/test/run.test.ts', 'e2e/specs/10-new-flow.flow.json',
  ]) assert.equal(write('test-writer', p), 0, p);
  for (const p of [
    'server/src/modules/x/service.ts', 'client/src/app/page.tsx', 'server/package.json',
    'client/vitest.config.ts', 'e2e/run.ts', 'server/clones/a/test/x.test.ts', '/etc/passwd', 'server/INSIGHTS.md',
  ]) assert.equal(write('test-writer', p), 2, p);
});

test('doc-writer writes only package docs and READMEs', () => {
  for (const p of [
    'README.md', 'server/README.md', 'client/docs/run-cost.md', 'server/docs/README.md',
    'server/src/modules/repo-intel/README.md',
  ]) assert.equal(write('doc-writer', p), 0, p);
  for (const p of [
    'docs/plans/001-x.md', 'docs/agent-prompts/a.md', 'docs/skills/a/SKILL.md', 'server/specs/005-x.md',
    'server/INSIGHTS.md', 'AGENTS.md', 'server/docs/diagram.ts', 'server/src/modules/x/service.ts',
  ]) assert.equal(write('doc-writer', p), 2, p);
  assert.equal(bash('doc-writer', 'ls'), 2);
});

test('readonly and verifier never write files', () => {
  assert.equal(write('readonly', 'server/test/a.test.ts'), 2);
  assert.equal(write('verifier', 'README.md'), 2);
  assert.equal(run('readonly', 'Edit', { file_path: `${root}/README.md` }).code, 2);
});

test('readonly allows read-only commands only', () => {
  for (const c of [
    'git diff HEAD -- server/src', 'git --no-pager log --oneline -5', 'git -C server status --porcelain',
    'git status --porcelain && git diff --stat', 'rg -n "foo|bar" server/src 2>/dev/null', 'ls -la | head -20',
    'cd server && git diff HEAD', 'grep -rn "x" client/src 2>&1 | wc -l',
    'sed -n 1,110p server/src/a.ts', "sed -n '185,250p' docs/plans/006-x.md", 'sed -n 12p a.ts b.ts', "sed -n '40,$p' a.ts",
  ]) assert.equal(bash('readonly', c), 0, c);
  for (const c of [
    'pnpm test', 'git commit -m x', 'git checkout .', 'git diff --output=/tmp/x', 'git -c core.pager=sh log',
    'echo x > file', 'cat a >> b', 'ls | tee out', 'find . -name x -delete', 'find . -exec rm {} ;',
    'cat $(echo /etc/passwd)', 'ls `pwd`', 'diff <(ls a) <(ls b)', 'FOO=1 ls', 'rm -rf server',
    'node -e "1"', 'sed -i s/a/b/ f', 'rg --pre cat x', 'echo "unterminated',
    'sed -n 1p -i f', "sed -n '1w out' f", "sed -n '1p;w out' f", 'sed -n 1,5e f', "sed 's/a/b/' f", 'sed -n -e 1p f',
  ]) assert.equal(bash('readonly', c), 2, c);
});

test('verifier and test-writer may run tests and typecheck', () => {
  for (const profile of ['verifier', 'test-writer']) {
    for (const c of [
      'pnpm typecheck', 'cd server && pnpm exec vitest run --exclude \'**/*.it.test.ts\'', 'pnpm test',
      'npm test', 'npm run typecheck', 'npx vitest run test/run.test.ts', 'pnpm exec tsc --noEmit -p tsconfig.json',
      'cd client && pnpm vitest run src/app/agents/_components/AgentCard/AgentCard.test.tsx 2>&1 | tail -8',
    ]) assert.equal(bash(profile, c), 0, `${profile}: ${c}`);
    for (const c of [
      'pnpm add msw', 'pnpm exec vitest run -u', 'pnpm exec vitest run --update', 'npm install',
      'pnpm db:migrate', 'pnpm exec vitest', 'npx tsx run.ts', 'pnpm test > out.txt', 'pnpm vitest', 'pnpm vitest run -u',
    ]) assert.equal(bash(profile, c), 2, `${profile}: ${c}`);
  }
});

test('for loops and timeout: the loop body and the timed command are checked like any segment', () => {
  for (const profile of ['test-writer', 'verifier', 'readonly']) {
    for (const c of [
      'for f in a.ts b.ts; do wc -l $f; done', 'for f in server/src/*.ts\ndo\n  grep -c x "$f"\ndone',
      'for a in x y; do for b in 1 2; do echo $a $b; done; done', 'for f in a b; do sed -n 1,5p $f; done 2>&1 | head',
    ]) assert.equal(bash(profile, c), 0, `${profile}: ${c}`);
    for (const c of [
      'for i in 1; do curl x; done', 'for f in a; do rm $f; done', 'for f in $(ls); do cat $f; done',
      'for f in a; do cat $f > out; done', 'for f in a; do FOO=1 ls; done', 'for f in a; do find . -delete; done',
      'for PATH in /tmp/x; do ls; done', 'for f in a; do node -e 1; done', 'timeout 5 sh -c \'rm -rf .\'',
      'timeout 5 bash -c x', 'timeout 5 find . -delete', 'timeout 5 FOO=1 ls', 'timeout -s KILL 5 ls',
    ]) assert.equal(bash(profile, c), 2, `${profile}: ${c}`);
  }
  for (const profile of ['test-writer', 'verifier']) {
    for (const c of ['timeout 120 pnpm test', 'cd server && timeout 5m pnpm exec vitest run x.test.ts 2>&1 | tail -20']) {
      assert.equal(bash(profile, c), 0, `${profile}: ${c}`);
    }
  }
  assert.equal(bash('readonly', 'timeout 5 pnpm test'), 2, 'timeout does not widen the allowlist');
  for (const c of ['for f in a; do wc; done', 'timeout 5 wc']) assert.equal(bash('workflow-retro', c), 2, `workflow-retro: ${c}`);
});

test('quoting, $-expansions and loop variables cannot smuggle a forbidden flag', () => {
  for (const profile of ['test-writer', 'verifier', 'readonly']) {
    for (const c of [
      'for f in a.ts b.ts; do grep -n x "$f"; done', 'for f in server/src/*.ts; do wc -l "${f}"; done',
      "for f in 'a.ts' \"b.ts\"; do echo $f; done 2>&1 | head", "grep -n '$HOME' a.ts", "rg -n 'x --pre y' src",
      'git log --output-indicator-new=+ -1', 'git log --oneline -3',
    ]) assert.equal(bash(profile, c), 0, `${profile}: ${c}`);
    for (const c of [
      // loop words that are, or could expand to, a flag
      'for a in -exec; do find . $a sh -c id {} +; done', 'for a in -delete; do find . -name x $a; done',
      'for a in --output=/tmp/x; do git diff $a; done', 'for a in -i; do sed -n 1p $a f; done',
      'for a in --pre=sh; do rg $a x; done', "for a in '-delete'; do find . $a; done", 'for a in "x -delete"; do find . -name $a; done',
      'for a in *; do find . $a; done', 'for a in {-delete,x}; do find . $a; done', 'for a in $HOME; do ls $a; done',
      // a flag built from a variable, or a command name from a variable
      'for a in delete; do find . -$a; done', 'for a in put; do git diff --out$a=/tmp/x; done', 'for a in x; do cat$a f; done',
      // expansions that are not a loop variable
      'find . -name x${IFS}-delete', 'find . $IFS-delete', "find . $'\\055delete'", 'ls $HOME', 'cat "$OPENAI_API_KEY"',
      'echo $1', 'for f in a; do ls $g; done',
      // quotes inside a flag
      "find . '-delete'", "find . -del''ete", 'find . "-exec" rm {} +', "git diff '--output=/tmp/x'", 'git diff --outp=/tmp/x',
      "rg '--pre=sh' x", 'git grep -iOvim x', "pnpm exec vitest run '-u'",
      // brace expansion, line continuations, and a loop variable that is reassigned or is bash's `$_`
      'find /tmp/x {-delete,-print}', 'git diff {--output=/tmp/pwn,HEAD}', 'git grep {-Otouch,-n} x', 'rg {--pre=bash,-n} x',
      'for a in src/{a,b}.ts; do ls $a; done', 'find /tmp/x -del\\\nete', 'find /tmp/x "-del\\\nete"',
      'for f in a; do printf -v f %s -delete; find /tmp/x $f; done', 'for _ in a; do echo -delete; find /tmp/x $_; done',
      // `$[…]` arithmetic, loop words bash would evaluate, and a loop variable used outside its loop
      "for f in 'x[$''(id)]'; do echo $[f]; done", 'echo $[1]', 'echo "$[1]"', "for f in 'a>b'; do ls $f; done",
      "for f in 'a(b)'; do ls $f; done", 'echo $http_proxy; for http_proxy in a; do ls; done',
      'for f in a; do ls; done; cat $f', 'for f in a; do ls; done | grep $f',
      // a comment or heredoc hiding a quote; a loop opened through timeout or without `do`
      "echo # '\nfind /tmp/x -delete\necho # '", "echo # '\nrm -rf /tmp/x; touch /tmp/y > /tmp/z\necho # '",
      "cat <<true\necho '\ntrue\nfind /tmp/x -delete\ncat <<true\n'\ntrue", 'grep x <<< "y"', 'ls # comment',
      'timeout 5 for http_proxy in a\necho $http_proxy', 'for http_proxy in a\necho $http_proxy', 'timeout 5 done',
    ]) assert.equal(bash(profile, c), 2, `${profile}: ${c}`);
  }
  for (const c of ['pnpm test --u', 'pnpm test -- --u', 'npx vitest run --u', 'pnpm exec vitest run --upd']) {
    assert.equal(bash('test-writer', c), 2, c);
  }
  assert.equal(bash('readonly', "grep -n 'a#b' x.ts; grep -c x#y x.ts"), 0, '# inside a word is text');
  assert.equal(bash('verifier', 'for f in a.ts; do timeout 60 grep -c x $f; done'), 0, 'timeout inside a loop body');
  assert.equal(bash('test-writer', 'pnpm test {-u,}'), 2, 'pnpm test {-u,}');
  assert.equal(bash('test-writer', 'pnpm test -$[0]u'), 2, 'pnpm test -$[0]u');
  assert.equal(bash('readonly', "grep -n '$[x]' a.ts"), 0, 'single-quoted $[ is text');
  assert.equal(bash('readonly', 'for f in a.ts; do for g in 1 2; do echo $f $g; done; echo $f; done'), 0, 'nested loops');
  assert.equal(bash('readonly', "grep -n '{a,b}' x.ts"), 0, 'quoted braces are fine');
  for (const p of ['server/test/-delete', 'client/src/-x/a.test.ts']) assert.equal(write('test-writer', p), 2, p);
});

// Each blocked case below was confirmed to write a file or run a program in real bash (GNU sed 4.9, ripgrep 15,
// uutils sort, tree 2.3, file 5.46, tsc, vitest 2, npm 10) before the fix.
const RO = ['test-writer', 'verifier', 'readonly'];
const allBash = (profiles, cmds, code) => {
  for (const profile of profiles) for (const c of cmds) assert.equal(bash(profile, c), code, `${profile}: ${c}`);
};

test('a backslash-escaped quote cannot hide a redirect or a process substitution', () => {
  allBash(RO, [
    "echo \\' > server/src/index.ts \\'", "echo \\' >> server/src/index.ts \\'", "diff \\' <(touch /tmp/x) \\'",
    "cat \\' <(rm -rf server/src) \\'", 'echo \\" > x \\"', "grep -n x a.ts \\'#\\' > out",
  ], 2);
  // `\\'` is an escaped backslash and then a real quote: the `>` is inside it.
  allBash(RO, ["echo \\'", "echo \\\\' > x '", 'echo \\> x', "grep -n 'a>b' a.ts", 'grep -n "a>b" a.ts', "grep -n \"it's\" a.ts", 'grep -c "\\"x\\"" a.ts'], 0);
});

test('the command is the exact allowed name — not a path through a folder named like it, nor a script suffix', () => {
  allBash(RO, [
    'file/../../../../../../usr/bin/touch /tmp/x', 'cd /usr/share && file/../../bin/sh -c id',
    'cd client/node_modules && diff/../../../../../../usr/bin/rm -rf x', 'true/../../bin/bash -c id', 'cat-x y', 'ls.sh',
    'timeout 5 file/../../bin/sh', 'git diffx', 'git log/x',
  ], 2);
  allBash(['test-writer', 'verifier'], ['pnpm test:e2e', 'pnpm run test:x', 'pnpm typecheck-x', 'npm run test:x', 'docker ps-x', 'npx vitest run.x'], 2);
  allBash(RO, ['cat a.ts', 'ls', 'pwd', 'true', 'git diff-tree --no-commit-id --name-only -r HEAD', 'git status'], 0);
});

test('fd duplication takes digits only and /dev/null a whole word', () => {
  allBash(RO, [
    'echo x >&1x', 'echo x 1>&2y', 'cd docs/plans && echo x >&006-x.md', 'cd server/drizzle && echo x >&0001_init.sql',
    "ls >/dev/null'x'", 'ls >/dev/nullx', 'ls 2>/dev/null.x', 'ls >/dev/null\\x', 'ls >/dev/null2>&1',
  ], 2);
  allBash(RO, ['ls 2>&1 | head', 'ls >/dev/null 2>&1', 'ls &>/dev/null', 'ls 2>/dev/null', 'git status 2>&1'], 0);
});

test('a sed script may not come from a loop variable (e = run each line, w = write)', () => {
  allBash(RO, [
    'for p in e; do sed -n $p f; done', 'for p in 1e; do sed -n "$p" f; done', 'for p in 2wout; do sed -n 1,$p f; done',
    'for p in wserver/src/index.ts; do sed -n $p README.md; done',
  ], 2);
  allBash(RO, ['for f in a b; do sed -n 1,5p $f; done', "sed -n '40,$p' a.ts", "for f in a.ts; do sed -n '1,$p' \"$f\"; done"], 0);
});

test('read-only commands may not write or run a program through their own flags', () => {
  allBash(RO, [
    'sort -o x a', 'sort --output=x a', 'sort --o=x a', 'sort -no x a', 'sort -S 1K --compress-program=sh a', 'sort --co=sh a',
    'sort -T /tmp a', 'uniq a b', 'uniq -c a b', 'uniq -- a b', 'tree -o x', 'tree -R -L 1', 'tree --output x',
    'file -C -m x', 'file --compile -m x', 'rg --hostname-bin=./x --hyperlink-format=default y', 'rg --hostname-bin ./x y',
    'rg --pre=sh x', 'git grep -Osh x', 'git -C . grep -O x', 'git grep --open-files-in-pager=sh x',
  ], 2);
  allBash(RO, [
    'sort -n a', 'sort -t: -k2 -nr a', 'sort -u a', 'sort --reverse --numeric-sort a', 'uniq -c', 'uniq -c a',
    'sort a | uniq -c | sort -rn | head', 'tree -L 2 server/src', 'file a.ts', 'rg -n x src', 'git log -SOptions --oneline',
    "git log -S'Options'", 'git diff -O/dev/null HEAD',
  ], 0);
});

test('globs cannot expand into flags, and a glob loop variable must be quoted', () => {
  allBash(RO, [
    'find * -name x', 'rg x *', 'sed -n 1p *', 'ls *.md', 'ls ""*', 'ls ?x', 'find . -name x -delet[e]', 'find . -de*',
    'rg x --pre*', 'ls @(a)', 'grep -c x [-]i', 'for f in server/test/*; do find $f; done',
    'for f in src/*.ts; do wc -l ${f}; done', 'for f in a* b; do rg x $f; done', 'for f in src/*; do for g in a; do ls $f; done; done',
    "for f in 'a(b'; do ls \"$f\"; done",
  ], 2);
  allBash(RO, [
    'ls ./*', 'rg x ./*', 'wc -l server/src/*.ts', 'grep -rn x --include=*.ts .', "find . -name '*.ts'",
    'for f in server/src/*.ts; do wc -l "$f"; done', 'for f in a.ts b.ts; do wc -l $f; done', 'git log --format=[%h] -1',
    'for f in src/*; do for g in a b; do echo "$f" $g; done; done',
  ], 0);
});

test('test runners may not write reports, profiles or coverage, load other config or reconfigure npm', () => {
  allBash(['test-writer', 'verifier'], [
    'pnpm exec vitest run --outputFile=src/x.ts', 'pnpm exec vitest run --reporter=json --outputFile.json=x',
    'pnpm test --coverage.enabled --coverage.reportsDirectory=src', 'pnpm test --coverage', 'pnpm exec vitest run --config=x.ts',
    'pnpm exec vitest run -c x.ts', 'pnpm exec vitest run --root ../x', 'npx vitest run --globalSetup=x.ts', 'pnpm test --reporter=html',
    'pnpm test --reporter html', 'pnpm test -- --dir server/clones/x', 'pnpm exec tsc --noEmit --generateCpuProfile src/x.ts',
    'pnpm exec tsc --noEmit --GENERATETRACE x', 'pnpm exec tsc --noEmit false --outDir x', 'pnpm exec tsc --noEmit --incremental',
    'pnpm typecheck --noEmit false', 'npm test --script-shell=./x', 'npm run typecheck --prefix x', 'npm test --silent',
    'npm test -- --outputFile=x', 'npx tsc --noEmit -b',
  ], 2);
  allBash(['test-writer', 'verifier'], [
    'pnpm test -- test/a.test.ts', "pnpm exec vitest run test/a.test.ts -t 'updates user' --reporter=verbose",
    'npm test -- --reporter=dot', 'npm test -- test/a.test.ts', 'pnpm exec tsc --noEmit -p tsconfig.test.json --pretty',
    'pnpm exec vitest run --no-coverage', 'npx vitest run --project unit', 'npm run typecheck',
  ], 0);
});

test('cd and git -C may not enter server/clones/ (untrusted imported repos)', () => {
  allBash(RO, [
    'cd server/clones/x && git status', 'cd server && cd clones/x && ls', 'git -C server/clones/x status', 'cd server/clo* && ls',
    'cd "server/clones" && ls', 'cd server/x/../clones && ls', 'for d in server/clones/x; do cd $d; done', 'for d in server/*; do cd "$d"; done',
  ], 2);
  allBash(['test-writer', 'verifier'], ['cd server/clones/x && pnpm test'], 2);
  allBash(RO, [
    "rg -n x --glob '!server/clones/**' .", 'cd server && git status', 'grep -rn x --exclude-dir=clones .', 'git -C server log -1',
    'for d in server client; do cd $d; done',
  ], 0);
});

test('comments after a redirect operator, unbounded commands and catastrophic backtracking are refused fast', () => {
  allBash(RO, ['cat a <#x', 'ls >#x', 'ls ' + 'a '.repeat(20_000)], 2);
  const t = Date.now();
  assert.equal(bash('readonly', 'echo ' + '$'.repeat(20_000)), 2);
  assert.equal(bash('readonly', 'sed -n 1p' + ' a'.repeat(15_000) + ' ;'), 0);
  assert.ok(Date.now() - t < 5000, 'linear-time checks');
});

test('writers may not create file names that turn into flags, nor write through a symlink', () => {
  for (const p of ['server/test/x . -delete', 'server/test/a --pre=sh', 'server/test/a\tb.test.ts', 'server/test/a\nb.ts', 'server/test/-x.ts']) {
    assert.equal(write('test-writer', p), 2, JSON.stringify(p));
  }
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'link-guard-')));
  for (const d of ['server/test', 'server/src']) mkdirSync(join(repo, d), { recursive: true });
  writeFileSync(join(repo, 'server/src/a.ts'), '');
  symlinkSync(join(repo, 'server/src'), join(repo, 'server/test/src-link'));
  symlinkSync(join(repo, 'server/src/a.ts'), join(repo, 'server/test/a.test.ts'));
  symlinkSync(join(repo, 'server/src/new.ts'), join(repo, 'server/test/dangling.test.ts'));
  const w = (p) => run('test-writer', 'Write', { file_path: join(repo, p), content: 'x' }, repo).code;
  assert.equal(w('server/test/src-link/b.ts'), 2, 'symlinked folder');
  assert.equal(w('server/test/a.test.ts'), 2, 'symlinked file');
  assert.equal(w('server/test/dangling.test.ts'), 2, 'dangling symlink');
  assert.equal(w('server/test/real.test.ts'), 0, 'a plain new test');
});

test('every agent that can run Bash or write files has a PreToolUse guard', () => {
  const agents = join(dirname(guard), '../agents');
  for (const f of readdirSync(agents).filter((n) => n.endsWith('.md') && n !== 'README.md')) {
    const front = readFileSync(join(agents, f), 'utf8').split(/^---$/m)[1] ?? '';
    const tools = (front.match(/^tools:(.*)$/m)?.[1] ?? '*').split(',').map((t) => t.trim());
    const risky = tools.some((t) => ['*', 'Bash', 'Edit', 'Write', 'NotebookEdit'].includes(t));
    const guarded = /PreToolUse:[\s\S]*?\.claude\/hooks\/(?:agent|implementer)-guard\.mjs/.test(front);
    assert.ok(!risky || guarded, `${f}: tools ${tools.join(', ')} without a PreToolUse guard`);
  }
});

test('sed -n takes line-number, $ and /regex/ addresses followed only by p', () => {
  for (const c of [
    "sed -n '/^## Tests/,/^## /p' docs/plans/006-x.md", "sed -n '/a\\/b/p' f", "sed -n '12,/^## /p' f",
    "sed -n '/^export/,$p' f", 'sed -n 1,110p f',
  ]) assert.equal(bash('readonly', c), 0, c);
  for (const c of [
    "sed -n '/a/w out' f", "sed -n '/a/p;w out' f", "sed -n '/a/e' f", "sed -n -i '/a/p' f", "sed -n -e '/a/p' f",
    "sed -n '/a/,/b/p' -i f", 'sed -n /a/p f', 'sed -n "/a/p" f', "sed -n '/a/Ip' f", "sed -n '\\,a,p' f",
  ]) assert.equal(bash('readonly', c), 2, c);
});

test('test-writer and verifier may run read-only docker and next typegen; readonly may not', () => {
  for (const profile of ['test-writer', 'verifier']) {
    for (const c of ['docker info', 'docker ps -a', 'cd client && pnpm exec next typegen']) assert.equal(bash(profile, c), 0, `${profile}: ${c}`);
    for (const c of ['docker run --rm alpine sh', 'docker info; rm x', 'docker exec db psql', 'docker ps -q | xargs docker rm', 'docker compose up']) {
      assert.equal(bash(profile, c), 2, `${profile}: ${c}`);
    }
  }
  for (const c of ['docker info', 'pnpm exec next typegen']) assert.equal(bash('readonly', c), 2, c);
});

test('no other profile may spawn subagents', () => {
  for (const profile of ['test-writer', 'doc-writer', 'verifier', 'readonly']) {
    assert.equal(run(profile, 'Agent', { subagent_type: 'researcher', prompt: 'x' }).code, 2, profile);
  }
});

test('spec-creator writes only spec files, with the next free number, and spawns only researcher / brainstorm', () => {
  const repo = mkdtempSync(join(tmpdir(), 'spec-guard-'));
  for (const d of ['specs', 'server/specs', 'client/specs', 'reviewer-core/specs']) mkdirSync(join(repo, d), { recursive: true });
  writeFileSync(join(repo, 'server/specs/004-conventions.md'), '');
  writeFileSync(join(repo, 'client/specs/004-conventions.md'), '');
  writeFileSync(join(repo, 'server/specs/README.md'), '');
  const w = (p, tool = 'Write') => run('spec-creator', tool, { file_path: join(repo, p) }, repo).code;

  for (const p of ['specs/005-pr-digest.md', 'server/specs/005-x.md', 'client/specs/005-a-b.md',
    'reviewer-core/specs/005-x.md', 'mcp/specs/005-x.md']) assert.equal(w(p), 0, p);
  assert.equal(w('server/specs/004-conventions.md', 'Edit'), 0, 'edit of an existing spec');
  for (const p of ['specs/004-dup.md', 'specs/006-gap.md', 'specs/001-old.md']) assert.equal(w(p), 2, `number: ${p}`);
  for (const p of ['specs/README.md', 'server/specs/README.md', 'e2e/specs/05-x.flow.json', 'e2e/specs/005-x.md',
    'specs/005-Pr_Digest.md', 'specs/5-x.md', 'specs/sub/005-x.md', 'docs/plans/005-x.md', 'server/src/a.ts',
    'server/clones/r/server/specs/005-x.md', 'AGENTS.md', 'server/INSIGHTS.md', '../005-x.md',
  ]) assert.equal(w(p), 2, p);

  for (const t of ['researcher', 'brainstorm']) assert.equal(run('spec-creator', 'Agent', { subagent_type: t, prompt: 'q' }, repo).code, 0, t);
  for (const t of ['implementer', 'general-purpose', 'spec-creator', undefined]) {
    assert.equal(run('spec-creator', 'Agent', { subagent_type: t, prompt: 'q' }, repo).code, 2, String(t));
  }
  assert.equal(run('spec-creator', 'Bash', { command: 'ls' }, repo).code, 2);
});

test('spec-creator loads on demand only security / postgresql-table-design; other profiles load none', () => {
  for (const k of ['security', 'postgresql-table-design', '/security']) assert.equal(run('spec-creator', 'Skill', { skill: k }).code, 0, k);
  for (const k of ['onion-architecture', 'pr-self-review', 'engineering-insights', 'ears-requirements', '', undefined]) {
    assert.equal(run('spec-creator', 'Skill', { skill: k }).code, 2, String(k));
  }
  for (const profile of ['test-writer', 'doc-writer', 'verifier', 'readonly']) assert.equal(run(profile, 'Skill', { skill: 'security' }).code, 2, profile);
});

// workflow-retro: a temp repo with a ledger and a transcript; the guard is active only in the /workflow-retro turn.
function retroFixture() {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'retro-guard-')));
  mkdirSync(join(repo, 'docs/retro/ledger'), { recursive: true });
  writeFileSync(join(repo, 'docs/retro/ledger/README.md'), '# Workflow retro ledger\n');
  writeFileSync(join(repo, 'docs/retro/ledger/runs.md'), '# runs\n\n### 2026-11-01 — first\nline A\nline B\n');
  const transcript = join(repo, 'session.jsonl');
  const human = (promptId, content) => JSON.stringify({ type: 'user', origin: { kind: 'human' }, promptId, message: { role: 'user', content } });
  writeFileSync(transcript, [
    human('p-before', 'fix the bug'),
    JSON.stringify({ type: 'user', promptId: 'p-before', message: { content: [{ type: 'tool_result', content: '<command-name>/workflow-retro</command-name>' }] } }),
    human('p-retro', '<command-message>workflow-retro</command-message>\n<command-name>/workflow-retro</command-name>\n<command-args>--deep</command-args>'),
    human('p-after', 'apply P-1'),
  ].join('\n') + '\n');
  const call = (tool, toolInput, promptId = 'p-retro', extra = {}) => {
    const r = spawnSync('node', [guard, 'workflow-retro'], {
      input: JSON.stringify({ tool_name: tool, tool_input: toolInput, cwd: repo, prompt_id: promptId, transcript_path: transcript, ...extra }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      encoding: 'utf8',
    });
    return r.status;
  };
  return { repo, call };
}

test('workflow-retro guards only the turn that invoked /workflow-retro', () => {
  const { repo, call } = retroFixture();
  const outside = { file_path: join(repo, 'AGENTS.md'), content: 'x' };
  assert.equal(call('Write', outside), 2, 'retro turn');
  assert.equal(call('Write', outside, 'p-after'), 0, 'a later turn is not guarded');
  assert.equal(call('Write', outside, 'p-before'), 0, 'a tool result quoting the command does not arm the guard');
  assert.equal(call('Write', outside, 'p-not-flushed-yet'), 2, 'prompt not in the transcript yet → fail closed');
  assert.equal(call('Write', outside, undefined), 2, 'no prompt_id → fail closed');
  assert.equal(call('Write', outside, 'p-after', { transcript_path: join(repo, 'missing.jsonl') }), 2, 'unreadable transcript → fail closed');
});

test('workflow-retro may call only read tools, Bash, Edit/Write and AskUserQuestion', () => {
  const { repo, call } = retroFixture();
  const ledger = { file_path: join(repo, 'docs/retro/ledger/runs.md'), path: join(repo, 'docs/retro/ledger'), pattern: '*' };
  for (const t of ['Read', 'Grep', 'Glob', 'AskUserQuestion']) assert.equal(call(t, ledger), 0, t);
  for (const t of ['Agent', 'Task', 'Skill', 'Workflow', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Artifact',
    'mcp__plugin_github_github__push_files', 'mcp__devdigest__run_agent_on_pr', 'CronCreate']) assert.equal(call(t, {}), 2, t);
});

test('workflow-retro writes only the ledger: Write creates, Edit appends at the end', () => {
  const { repo, call } = retroFixture();
  const L = (f) => join(repo, 'docs/retro/ledger', f);
  assert.equal(call('Write', { file_path: L('test-writer.md'), content: '# x\n' }), 0, 'new component file');
  for (const p of ['runs.md', 'README.md', 'Bad_Name.md', 'sub/x.md', 'x.json']) assert.equal(call('Write', { file_path: L(p), content: 'x' }), 2, p);
  for (const p of ['docs/retro/x.md', 'docs/plans/001-x.md', '.claude/agents/implementer.md', '.claude/hooks/agent-guard.mjs',
    'AGENTS.md', 'server/INSIGHTS.md', '../x.md', '/etc/passwd']) {
    assert.equal(call('Write', { file_path: p.startsWith('/') ? p : join(repo, p), content: 'x' }), 2, p);
  }
  const edit = (old_string, new_string, more = {}) => call('Edit', { file_path: L('runs.md'), old_string, new_string, ...more });
  assert.equal(edit('line B\n', 'line B\n\n### 2026-11-06 — second\n'), 0, 'append after the last line');
  assert.equal(edit('line B', 'line B\n\n### new\n'), 0, 'last line without its newline');
  assert.equal(edit('line A\n', 'line A\nline A2\n'), 2, 'insertion in the middle');
  assert.equal(edit('line B\n', 'line C\n'), 2, 'rewrite of the last line');
  assert.equal(edit('line B\n', ''), 2, 'delete');
  assert.equal(edit('', 'x'), 2, 'empty old_string');
  assert.equal(edit('line B\n', 'line B\nx\n', { replace_all: true }), 2, 'replace_all');
  assert.equal(call('Edit', { file_path: L('nope.md'), old_string: 'a', new_string: 'ab' }), 2, 'Edit of a missing file');

  symlinkSync(join(repo, 'AGENTS.md'), L('evil.md'));
  assert.equal(call('Write', { file_path: L('evil.md'), content: 'x' }), 2, 'symlinked file');
  mkdirSync(join(repo, 'elsewhere'));
  rmSync(join(repo, 'docs/retro/ledger'), { recursive: true });
  symlinkSync(join(repo, 'elsewhere'), join(repo, 'docs/retro/ledger'));
  assert.equal(call('Write', { file_path: L('new-file.md'), content: 'x' }), 2, 'symlinked ledger folder');
});

test('workflow-retro Bash: only the collector by absolute path and stdin filters', () => {
  const { repo, call } = retroFixture();
  const bash = (command) => call('Bash', { command });
  const collect = `node "$(git rev-parse --show-toplevel)/.claude/skills/workflow-retro/scripts/collect.mjs"`;
  const out = join(tmpdir(), 'workflow-retro-x.json');
  for (const c of [
    `${collect} --session 11111111-2222-3333-4444-555555555555 --plan 006 --baseline --record --out ${out}`,
    `${collect} --list --limit 5`, `${collect} --session 1111 --since 2026-11-06T10:00:00.000Z --until 2026-11-06T12:00:00Z`,
    `node ${repo}/.claude/skills/workflow-retro/scripts/collect.mjs --list | jq '.sessions[0]'`,
    `${collect} --list | head -n 20`, `${collect} --list | wc -l`,
  ]) assert.equal(bash(c), 0, c);
  for (const c of [
    `${collect} > docs/retro/ledger/runs.md`, `${collect} --list > ${out}`, 'echo x >> docs/retro/ledger/runs.md',
    'node .claude/skills/workflow-retro/scripts/collect.mjs --list', `cd /tmp && ${collect}`, `${collect} --list; cat .env`,
    `node "$(git rev-parse --show-toplevel)/.claude/skills/run-plan/scripts/run-plan.mjs" status 006`,
    `node "$(git rev-parse --show-toplevel)/x.mjs"`, 'node -e 1', 'cat $(whoami)', 'curl https://example.com',
    `jq . ${out}`, 'jq . ~/.claude.json', 'head -n 5 .env', 'tail ~/.claude/projects/x/s.jsonl', 'grep -r token .',
    'cat docs/retro/ledger/runs.md', 'git log --oneline -5', 'ls', `${collect} --session "a;b"`,
    'git commit -m x', 'sed -i s/a/b/ docs/retro/ledger/runs.md', `tee ${out}`, 'rm docs/retro/ledger/runs.md',
    // jq that reads the environment, a file or a module
    `${collect} --list | jq -n 'env'`, `${collect} --list | jq '$ENV.OPENAI_API_KEY'`, `${collect} --list | jq -r 'env | keys'`,
    `${collect} --list | jq -n "\\"\${OPENAI_API_KEY}\\""`, `${collect} --list | jq "$HOME"`, "jq -f '/etc/passwd'",
    "jq -L '/tmp' 'import \"x\" as x; x::f'", `${collect} --list | jq 'include "x"; .'`, "jq -rf '/etc/passwd'",
  ]) assert.equal(bash(c), 2, c);
  for (const c of [`${collect} --list | jq -r '.sessions | length'`, `${collect} --list | jq -c '.sessions[] | {id, environment: .env_x}'`]) {
    assert.equal(bash(c), 0, c);
  }
  // jq ≤ 1.6 parses `$ ENV` as `$ENV`.
  for (const c of [`${collect} --list | jq -n '$ ENV'`, `${collect} --list | jq -n '$  ENV.KEY'`]) assert.equal(bash(c), 2, c);
  // Flag values may not start with `-`: `--x --x …` used to parse in 2^n ways (38 flags ≈ 14 s, past the hook timeout).
  const t = Date.now();
  assert.equal(bash(`${collect}${' --x'.repeat(60)} !`), 2, 'many flags, failing match');
  assert.equal(bash(`${collect}${' --x'.repeat(60)}`), 0, 'many flags');
  assert.ok(Date.now() - t < 5000, `collector regex is linear (${Date.now() - t} ms)`);
});

test('workflow-retro reads only the ledger, its skill folder and the collector JSON', () => {
  const { repo, call } = retroFixture();
  const out = join(tmpdir(), `workflow-retro-${process.pid}.json`);
  writeFileSync(out, '{}');
  for (const [tool, input] of [
    ['Read', { file_path: join(repo, 'docs/retro/ledger/runs.md') }], ['Read', { file_path: out }],
    ['Read', { file_path: join(repo, '.claude/skills/workflow-retro/SKILL.md') }],
    ['Grep', { pattern: '^### ', path: join(repo, 'docs/retro/ledger') }], ['Grep', { pattern: 'P-', path: 'docs/retro/ledger/runs.md' }],
    ['Glob', { pattern: '*.md', path: join(repo, 'docs/retro/ledger') }],
  ]) assert.equal(call(tool, input), 0, `${tool} ${JSON.stringify(input)}`);
  for (const [tool, input] of [
    ['Read', { file_path: join(repo, '.env') }], ['Read', { file_path: join(repo, 'docs/plans/006-x.md') }],
    ['Read', { file_path: join(repo, 'session.jsonl') }], ['Read', { file_path: join(tmpdir(), 'other.json') }],
    ['Read', { file_path: '/home/u/.claude/projects/p/s.jsonl' }], ['Read', { file_path: join(repo, 'docs/retro/ledger/../../../AGENTS.md') }],
    ['Read', {}], ['Grep', { pattern: 'token' }], ['Grep', { pattern: 'x', path: repo }], ['Glob', { pattern: '**/*' }],
    ['Glob', { pattern: '../../**', path: join(repo, 'docs/retro/ledger') }], ['Read', { file_path: join(repo, '.claude/hooks/agent-guard.mjs') }],
  ]) assert.equal(call(tool, input), 2, `${tool} ${JSON.stringify(input)}`);
  symlinkSync(join(repo, 'session.jsonl'), join(tmpdir(), `workflow-retro-link-${process.pid}.json`));
  assert.equal(call('Read', { file_path: join(tmpdir(), `workflow-retro-link-${process.pid}.json`) }), 2, 'symlinked collector JSON');
});
