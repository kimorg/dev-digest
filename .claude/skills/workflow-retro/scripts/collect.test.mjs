// Collector v2: metrics, windows, plan mode, baseline/record and the privacy contract.
// Run: node --test .claude/skills/workflow-retro/scripts/collect.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const collector = join(dirname(fileURLToPath(import.meta.url)), 'collect.mjs');
const SESSION = '11111111-2222-3333-4444-555555555555';
const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const usage = (out) => ({
  input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100, output_tokens: out,
  output_tokens_details: { thinking_tokens: 5 }, cache_creation: { ephemeral_1h_input_tokens: 100, ephemeral_5m_input_tokens: 0 },
});
const asst = (s, id, content, out = 50) => ({ type: 'assistant', timestamp: at(s), message: { id, model: 'claude-opus-5-5', usage: usage(out), content } });
const result = (s, id, content, isError = false) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });
const human = (s, content) => ({ type: 'user', timestamp: at(s), origin: { kind: 'human' }, promptId: `p${s}`, message: { content } });
const jsonl = (xs) => xs.map((x) => JSON.stringify(x)).join('\n') + '\n';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'retro-root-'));
  const projects = mkdtempSync(join(tmpdir(), 'retro-projects-'));
  mkdirSync(join(root, 'docs/retro/ledger'), { recursive: true });
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  mkdirSync(join(root, 'specs'), { recursive: true });
  mkdirSync(join(root, '.git/run-plan/007'), { recursive: true });
  writeFileSync(join(root, 'docs/plans/007-demo.md'), '# Plan\nSpec: `specs/007-demo.md`\n### S1: a\n### S2: b\n| T-1 | x |\n| T-2 | y |\n| T-2 | again |\n| T-3 | z |\n');
  writeFileSync(join(root, 'specs/007-demo.md'), 'AC-1 AC-2 AC-2 AC-9\n');
  writeFileSync(join(root, '.git/run-plan/007/state.json'), JSON.stringify({
    startedAt: at(0), plan: { id: '007', mode: 'multi-agent', packages: ['server', 'client'] },
    stages: [{ name: 'implement', status: 'ok', note: 'SECRET-NOTE', at: at(60) }, { name: 'fix-1', status: 'ok', at: at(80) }],
  }));

  writeFileSync(join(projects, `${SESSION}.jsonl`), jsonl([
    human(0, 'please do SECRET-PROMPT'),
    { type: 'queue-operation', timestamp: at(1), operation: 'enqueue', content: 'SECRET-QUEUE' },
    asst(5, 'm1', [{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { subagent_type: 'implementer', description: 'W1: server', prompt: 'SECRET-AGENT-PROMPT' } }]),
    result(6, 'tu1', 'launched'),
    asst(8, 'm2', [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: join(root, 'docs/plans/007-demo.md') } },
      { type: 'tool_use', id: 'r2', name: 'Read', input: { file_path: join(root, '.env') } }]),
    result(9, 'r1', 'SECRET-FILE-CONTENT'),
    result(9, 'r2', 'SECRET-ENV-CONTENT'),
    asst(10, 'm3', [{ type: 'text', text: 'SECRET-ASSISTANT-TEXT' }]),
    { type: 'user', timestamp: at(70), origin: { kind: 'task-notification' }, message: { content: '<task-notification><task-id>abc1234</task-id>SECRET-NOTIFICATION</task-notification>' } },
    asst(75, 'm4', [{ type: 'tool_use', id: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: 'SECRET-QUESTION' }] } }]),
    result(135, 'q1', 'SECRET-ANSWER'),
    asst(140, 'm5', [{ type: 'text', text: 'done' }]),
    human(600, '<command-message>workflow-retro</command-message>\n<command-name>/workflow-retro</command-name>'),
    asst(605, 'm6', [{ type: 'text', text: 'retro itself' }], 99999),
  ]));
  const sub = join(projects, SESSION, 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-abc1234.meta.json'), JSON.stringify({ agentType: 'implementer', description: 'W1: server', toolUseId: 'tu1', spawnDepth: 1, finished: true }));
  writeFileSync(join(sub, 'agent-abc1234.jsonl'), jsonl([
    { type: 'user', timestamp: at(7), message: { content: 'SECRET-AGENT-PROMPT' } },
    asst(10, 's1', [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'API_KEY=SECRET-ENV pnpm test --filter SECRET-ARG' } }]),
    result(40, 'b1', 'SECRET-OUTPUT'),
    asst(45, 's2', [{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: join(root, 'server/src/a.ts'), content: 'l1\nl2\nSECRET-CONTENT' } }]),
    result(46, 'w1', 'ok'),
    asst(50, 's3', [{ type: 'tool_use', id: 'b2', name: 'Bash', input: { command: 'cd docs && cat plans/007-demo.md > SECRET-OUT' } }]),
    result(51, 'b2', 'PreToolUse:Bash hook error: [node "$CLAUDE_PROJECT_DIR/.claude/hooks/agent-guard.mjs" test-writer]: agent-guard[test-writer]: shell write in "SECRET-DENIAL"', true),
    asst(55, 's4', [{ type: 'tool_use', id: 'r3', name: 'Read', input: { file_path: join(root, '.env') } }]),
    result(56, 'r3', 'SECRET-ENV-CONTENT'),
    asst(60, 's5', [{ type: 'text', text: 'SECRET-REPORT' }]),
  ]));
  const run = (...args) => {
    const r = spawnSync('node', [collector, ...args], { env: { ...process.env, RETRO_ROOT: root, RETRO_PROJECTS_DIR: projects }, encoding: 'utf8' });
    return { code: r.status, raw: r.stdout, json: JSON.parse(r.stdout || '{}') };
  };
  return { root, projects, run };
}

test('prints no message text, prompts, tool inputs/outputs, hook text, secret paths or plan notes', () => {
  const { run } = fixture();
  const r = run('--session', SESSION, '--plan', '007', '--baseline');
  assert.equal(r.code, 0, r.raw);
  assert.doesNotMatch(r.raw, /SECRET/);
  assert.doesNotMatch(r.raw, /\.env/);
});

test('measures tokens, cost, time split, tools, denials and delivery; excludes the retro turn', () => {
  const { run } = fixture();
  const { json: o } = run('--session', SESSION);
  assert.equal(o.ok, true);
  assert.equal(o.window.excludedRetroTurns, 1);
  assert.equal(o.main.usage.requests, 5, 'the /workflow-retro turn (m6) is not counted');
  assert.equal(o.totals.agents, 1);
  assert.equal(o.totals.tokens.grand.requests, 10);
  assert.equal(o.totals.tokens.grand.thinking, 50);
  assert.ok(o.totals.costUsd.total > 0);
  assert.deepEqual(o.totals.costUsd.unpricedModels, []);
  const t = o.totals.time;
  assert.equal(t.wallClockMs, 140_000);
  assert.equal(t.mainActiveMs + t.agentsOnlyMs + t.userWaitMs + t.idleMs, t.wallClockMs, 'the split covers the wall clock');
  assert.equal(t.userWaitMs, 60_000, 'AskUserQuestion 75→135 s');
  assert.equal(t.agentWaitMs, 60_000, 'idle 10→70 s until the task notification');
  const a = o.agents[0];
  assert.equal(a.type, 'implementer');
  assert.equal(a.label, 'W1: server');
  assert.equal(a.startDelayMs, 2000);
  assert.equal(a.toolMs, 30_000 + 1000 + 1000 + 1000);
  assert.deepEqual(a.bash, { 'pnpm test': { count: 1, ms: 30_000 }, cat: { count: 1, ms: 1000 } });
  assert.deepEqual(o.hotspots.denialsByGuard, { 'agent-guard:test-writer/shell-write:cat': 1 }, 'the denial key carries the command kind, never arguments');
  assert.equal(o.hotspots.slowestCalls[0].kind, 'pnpm test');
  assert.deepEqual(o.totals.delivery, { filesChanged: 1, linesAdded: 3, linesRemoved: 0, outsideRepoWrites: 0 });
  assert.deepEqual(o.duplicateReads.map((d) => d.path), ['docs/plans/007-demo.md'], 'Bash reads count (cd tracked); .env never listed');
});

test('--plan sets the window and adds stage timings and step/test/AC counts', () => {
  const { json: o } = fixture().run('--session', SESSION, '--plan', '007');
  assert.equal(o.plan.steps, 2);
  assert.equal(o.plan.tests, 3);
  assert.equal(o.plan.acceptanceCriteria, 3);
  assert.equal(o.plan.fixRounds, 1);
  assert.deepEqual(o.plan.stages.map((s) => s.durationMs), [60_000, 20_000]);
  assert.equal(o.window.requestedUntil, at(80));
  assert.equal(o.totals.time.wallClockMs, 75_000, 'activity span inside the window');
  assert.equal(o.plan.leadTimeMs, 80_000);
  assert.equal(o.ratios.minutesPerPlanStep, round1(80 / 60 / 2));
});
const round1 = (x) => Number(x.toFixed(1));

test('--record appends once; --baseline compares with the recorded history', () => {
  const { root, run } = fixture();
  const metrics = join(root, 'docs/retro/ledger/metrics.jsonl');
  assert.equal(run('--session', SESSION, '--record').json.recorded.appended, true);
  assert.equal(run('--session', SESSION, '--record').json.recorded.skipped, 'already recorded');
  assert.equal(readFileSync(metrics, 'utf8').trim().split('\n').length, 1);
  const row = JSON.parse(readFileSync(metrics, 'utf8'));
  for (const factor of [1, 3]) {
    writeFileSync(metrics, JSON.stringify({ ...row, session: `other-${factor}`, totals: { ...row.totals, wallClockMs: row.totals.wallClockMs * factor * 2 } }) + '\n', { flag: 'a' });
  }
  const b = run('--session', SESSION, '--baseline').json.baseline;
  assert.equal(b.runs, 2, 'the current session itself is not its own baseline');
  assert.equal(b.totals.wallClockMs.verdict, 'faster');
  assert.equal(b.byType.implementer.tokensPerRun.verdict, 'typical');
});

test('accepts only session uuids of this project and --out inside a temp dir', () => {
  const { run } = fixture();
  for (const s of ['../x', '/etc/passwd', 'abc', undefined]) assert.equal(run('--session', s ?? '').code, 1, String(s));
  assert.equal(run('--session', '99999999-2222-3333-4444-555555555555').code, 1);
  assert.equal(run('--session', SESSION, '--out', './out.json').code, 1);
  const dir = mkdtempSync(join(tmpdir(), 'retro-out-'));
  assert.equal(run('--session', SESSION, '--out', join(dir, 'other.json')).code, 1, 'name must be workflow-retro*.json');
  const out = join(dir, 'workflow-retro-run.json');
  const r = run('--session', SESSION, '--out', out);
  assert.equal(r.code, 0);
  assert.ok(existsSync(out));
  assert.equal(r.json.agents, undefined, 'stdout carries only the summary');
});

test('--list shows sessions with prompts, agents and retro runs only', () => {
  const { json } = fixture().run('--list');
  assert.deepEqual(json.sessions.map((s) => [s.session, s.prompts, s.agents, s.retroRuns]), [[SESSION, 2, 1, 1]]);
});

/** A main session that spawns one implementer whose transcript is `subEntries`. */
function agentFixture(subEntries) {
  const root = mkdtempSync(join(tmpdir(), 'retro-root-'));
  const projects = mkdtempSync(join(tmpdir(), 'retro-projects-'));
  writeFileSync(join(projects, `${SESSION}.jsonl`), jsonl([
    human(0, 'go'),
    asst(1, 'm1', [{ type: 'tool_use', id: 'tu1', name: 'Agent', input: { subagent_type: 'implementer', prompt: 'p' } }]),
    result(2, 'tu1', 'launched'),
  ]));
  const sub = join(projects, SESSION, 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-def5678.meta.json'), JSON.stringify({ agentType: 'implementer', toolUseId: 'tu1' }));
  writeFileSync(join(sub, 'agent-def5678.jsonl'), jsonl(subEntries));
  const r = spawnSync('node', [collector, '--session', SESSION], { env: { ...process.env, RETRO_ROOT: root, RETRO_PROJECTS_DIR: projects }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  return JSON.parse(r.stdout);
}

test('a tool call starts at the end of its assistant message, not at its tool_use entry', () => {
  // One message ('mm') streamed as two entries 30 s apart; both tools run after the second one.
  const o = agentFixture([
    { type: 'user', timestamp: at(3), message: { content: 'p' } },
    asst(10, 'mm', [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'pnpm test' } }]),
    asst(40, 'mm', [{ type: 'tool_use', id: 'b2', name: 'Bash', input: { command: 'git status' } }]),
    result(41, 'b1', 'ok'),
    result(41, 'b2', 'ok'),
    asst(45, 'm2', [{ type: 'text', text: 'done' }]),
  ]);
  const a = o.agents[0];
  assert.equal(a.usage.requests, 2, 'mm is counted once (plus m2)');
  assert.deepEqual(a.bash, { 'pnpm test': { count: 1, ms: 1000 }, 'git status': { count: 1, ms: 1000 } });
  assert.equal(a.toolMs, 1000);
  assert.equal(a.modelMs, a.activeMs - 1000);
});

test('a call that spans an idle gap is left out of the slowest calls and the Bash ms', () => {
  const o = agentFixture([
    { type: 'user', timestamp: at(3), message: { content: 'p' } },
    asst(10, 's1', [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'x', old_string: 'a', new_string: 'b' } }]),
    result(11, 'e1', 'ok'),
    asst(15, 's2', [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'pnpm test' } }]),
    result(415, 'b1', 'ok'), // 400 s > GAP_MS (180 s): a resume, not a test run
    asst(420, 's3', [{ type: 'tool_use', id: 'b2', name: 'Bash', input: { command: 'git status' } }]),
    result(422, 'b2', 'ok'),
    asst(425, 's4', [{ type: 'text', text: 'done' }]),
  ]);
  const a = o.agents[0];
  assert.equal(a.segments, 2);
  assert.deepEqual(a.slowestCalls.map((c) => [c.tool, c.ms]), [['Bash', 2000], ['Edit', 1000]]);
  assert.ok(o.hotspots.slowestCalls.every((c) => c.ms < 180_000), JSON.stringify(o.hotspots.slowestCalls));
  assert.deepEqual(a.bash['pnpm test'], { count: 1, ms: 0 }, 'counted, but its gap is not tool time');
  assert.equal(a.toolMs, 1000 + 2000, 'toolMs still clips calls to the activity segments');
});

test('a read-only call that finishes while its message still streams costs 0 ms, never negative', () => {
  // Read runs as soon as its block is written (10 s) and returns at 11 s; the message goes on to 20 s.
  const o = agentFixture([
    { type: 'user', timestamp: at(3), message: { content: 'p' } },
    asst(10, 'mm', [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'a.ts' } }]),
    result(11, 'r1', 'ok'),
    asst(20, 'mm', [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'for f in a; do wc -l $f; done' } }]),
    result(25, 'b1', 'ok'),
    asst(30, 'm2', [{ type: 'text', text: 'done' }]),
  ]);
  const a = o.agents[0];
  assert.deepEqual(a.slowestCalls.map((c) => [c.tool, c.ms]), [['Bash', 5000], ['Read', 0]]);
  assert.deepEqual(a.bash, { for: { count: 1, ms: 5000 } });
  assert.equal(a.toolMs, 5000);
  assert.ok(o.hotspots.slowestCalls.every((c) => c.ms >= 0));
});
