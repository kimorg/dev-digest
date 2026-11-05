// Allow/deny cases for agent-guard.mjs per profile. Run: node --test .claude/hooks/agent-guard.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
