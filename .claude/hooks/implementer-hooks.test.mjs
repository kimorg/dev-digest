// Cases for implementer-guard.mjs (shell writes) and implementer-verify.mjs (which packages get typechecked).
// Run: node --test .claude/hooks/implementer-hooks.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const hook = (name, input, root) => {
  const r = spawnSync('node', [join(here, name)], {
    input: JSON.stringify({ cwd: root, ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

test('implementer-guard: read, test, tool and temp-dir commands pass', () => {
  for (const command of [
    'cd server && pnpm typecheck 2>&1 | tail -5',
    "cd server && pnpm exec vitest run --exclude '**/*.it.test.ts' 2>&1 | grep -E \"Tests|FAIL\"",
    'git diff HEAD --stat && git status --porcelain',
    'cd server && pnpm db:generate --name blast_radius',
    'cd client && pnpm add clsx',
    'ls src > /dev/null 2>&1; echo done >&2',
    'grep -rn "a > b" src | head',
    "awk '$1 > 5' f.txt",
    'cd client && pnpm test > /tmp/claude-1000/out.txt 2>&1; tail -20 /tmp/claude-1000/out.txt',
    'pnpm test | tee /tmp/run.log | tail -5',
    'rm client/src/old.ts && mkdir -p client/src/new',
    'rm -f client/src/a.ts client/src/b.ts',
    'rmdir client/src/empty',
    'rm client/src/a.ts\nls -R client/src',
    'rm client/src/a.ts; ls -R client/src',
    'rm -f --force-ish-name.ts',
    'grep -rn "rm -rf" docs',
    'git log --format=%s | grep -c perf',
    'cat client/src/a.ts',
    'node scripts/check.mjs server',
  ]) assert.equal(hook('implementer-guard.mjs', { tool_name: 'Bash', tool_input: { command } }, '/repo').code, 0, command);
});

test('implementer-guard: shell writes of file content into the repo are blocked', () => {
  for (const command of [
    "cd client && cat > src/a.ts <<'EOF'\nexport const a = (x: number) => x > 1;\nEOF",
    'echo "x" >> server/src/a.ts',
    'printf x > ./README.md',
    "python3 - <<'EOF'\nopen('server/src/a.ts','w').write('x')\nEOF",
    'python3 -c "open(\'a\',\'w\')"',
    "node -e \"require('fs').writeFileSync('a','x')\"",
    "node --input-type=module -e 'x'",
    "sed -i 's/a/b/' server/src/a.ts",
    "perl -pi -e 's/a/b/' x.ts",
    'echo x | tee client/src/a.ts',
    'python3 /tmp/edit.py',
    'cmd &> server/out.log',
    'echo x > $OUT',
    'git commit -m x',
    'rm -r client/src/old',
    'rm -rf client/src/old',
    'rm -fr server/test/tmp',
    'rm -R mcp/dist',
    'rm -v -r mcp/dist',
    'rm --recursive client/.next',
    'cd client && rm -rf .next && pnpm test',
    'find client/src -name x -exec rm -r {} +',
  ]) {
    const r = hook('implementer-guard.mjs', { tool_name: 'Bash', tool_input: { command } }, '/repo');
    assert.equal(r.code, 2, command);
  }
});

const tmpRoots = [];
after(() => tmpRoots.forEach((r) => rmSync(r, { recursive: true, force: true })));
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'impl-verify-'));
  tmpRoots.push(root);
  for (const d of ['server/src', 'client/src', 'mcp/src']) mkdirSync(join(root, d), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}
function transcript(root, toolUses) {
  const p = join(root, 'transcript.jsonl');
  writeFileSync(p, toolUses.map((u) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', ...u }] } })).join('\n'));
  return p;
}
// No node_modules in the fake repo → every detected package is reported as "deps not installed".
const checked = (r) => [...(JSON.parse(r.stdout || '{}').systemMessage ?? '').matchAll(/(server|client|reviewer-core|mcp) \(deps/g)].map((m) => m[1]).sort();
const verify = (root, tools, id) =>
  hook('implementer-verify.mjs', { agent_id: id, agent_transcript_path: transcript(root, tools) }, root);

test('implementer-verify: Edit/Write only → exactly their packages (git changes of others ignored)', () => {
  const root = repo();
  writeFileSync(join(root, 'client/src/other.ts'), 'x'); // pre-existing / another workstream
  const r = verify(root, [{ name: 'Edit', input: { file_path: join(root, 'server/src/a.ts') } }], 't1');
  assert.equal(r.code, 0);
  assert.deepEqual(checked(r), ['server']);
});

test('implementer-verify: a shell write in the transcript adds the packages from git status', () => {
  const root = repo();
  writeFileSync(join(root, 'client/src/a.ts'), 'x');
  writeFileSync(join(root, 'mcp/src/b.ts'), 'x');
  const r = verify(root, [
    { name: 'Edit', input: { file_path: join(root, 'server/src/a.ts') } },
    { name: 'Bash', input: { command: "cd client && cat > src/a.ts <<'EOF'\nx\nEOF" } },
  ], 't2');
  assert.deepEqual(checked(r), ['client', 'mcp', 'server']);
});

test('implementer-verify: a script written to /tmp counts as a shell write', () => {
  const root = repo();
  writeFileSync(join(root, 'client/src/a.ts'), 'x');
  const r = verify(root, [
    { name: 'Write', input: { file_path: join(tmpdir(), 'edit.py') } },
    { name: 'Bash', input: { command: 'cd client && pnpm test' } },
  ], 't3');
  assert.deepEqual(checked(r), ['client']);
});

test('implementer-verify: no edits and no shell writes → nothing to check', () => {
  const root = repo();
  writeFileSync(join(root, 'client/src/a.ts'), 'x');
  const r = verify(root, [{ name: 'Bash', input: { command: 'git status --porcelain' } }], 't4');
  assert.equal(r.code, 0);
  assert.deepEqual(checked(r), []);
});

test('implementer-guard: Write on a test path is blocked, Edit of an existing test is allowed', () => {
  const root = '/repo';
  for (const file_path of [
    'server/test/blast.test.ts',
    'server/test/blast.it.test.ts',
    'server/test/helpers/pg.ts',
    'server/src/modules/blast/domain.test.ts',
    'client/src/app/x/_components/Card/Card.test.tsx',
    'client/src/test/setup.ts',
    'reviewer-core/test/prompt.test.ts',
    'mcp/test/fake-api.ts',
    'e2e/specs/07-new.flow.json',
  ].map((p) => `${root}/${p}`)) {
    const w = hook('implementer-guard.mjs', { tool_name: 'Write', tool_input: { file_path, content: 'x' } }, root);
    assert.equal(w.code, 2, `Write ${file_path}`);
    assert.match(w.stderr, /test-writer/);
    const e = hook('implementer-guard.mjs', { tool_name: 'Edit', tool_input: { file_path, old_string: 'a', new_string: 'b' } }, root);
    assert.equal(e.code, 0, `Edit ${file_path}`);
  }
  for (const file_path of [
    'server/src/adapters/mocks.ts',
    'client/src/app/x/_components/Card/Card.tsx',
    'server/src/modules/blast/testing.ts',
    'e2e/README.md',
  ].map((p) => `${root}/${p}`)) {
    assert.equal(hook('implementer-guard.mjs', { tool_name: 'Write', tool_input: { file_path, content: 'x' } }, root).code, 0, file_path);
  }
});

test('implementer-guard: cp / mv / ln / touch onto a test path are blocked', () => {
  for (const command of [
    'cp server/test/a.test.ts server/test/b.test.ts',
    'cd client && cp src/A.tsx src/A.test.tsx',
    'mv server/test/old.test.ts server/test/new.test.ts',
    'touch reviewer-core/test/x.test.ts',
    'ln -s ../a.ts mcp/test/b.ts',
    'ls && cp -f x e2e/specs/09-x.flow.json',
  ]) assert.equal(hook('implementer-guard.mjs', { tool_name: 'Bash', tool_input: { command } }, '/repo').code, 2, command);
  for (const command of [
    'cp client/src/a.ts client/src/b.ts',
    'mv server/src/old.ts server/src/new.ts',
    'cd server && pnpm exec vitest run test/blast.test.ts',
    'cat server/test/blast.test.ts',
  ]) assert.equal(hook('implementer-guard.mjs', { tool_name: 'Bash', tool_input: { command } }, '/repo').code, 0, command);
});
