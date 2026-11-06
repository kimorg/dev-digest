// Allow/deny cases for agent-guard.mjs per profile. Run: node --test .claude/hooks/agent-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
    'sed -n 1,110p server/src/a.ts', "sed -n '185,250p' docs/plans/006-x.md", 'sed -n 12p a.ts b.ts', 'sed -n "40,$p" a.ts',
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
  ]) assert.equal(bash(c), 2, c);
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
