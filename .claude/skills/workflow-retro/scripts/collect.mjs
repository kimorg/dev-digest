#!/usr/bin/env node
// /workflow-retro collector (schema 2). Reads a Claude Code session transcript of THIS project and its
// subagent transcripts and prints performance METADATA only: timestamps, durations, token usage, a cost
// estimate, tool names and call durations, Bash command kinds ("pnpm test"), agent types, hook-denial
// classes, repo-relative paths and counts.
//
// Privacy contract — the output never contains: message text, prompts, thinking, tool inputs or outputs,
// hook messages, file contents, command arguments, or paths outside the repo / to secret-like files.
// The SKILL relies on this: the retro analyses this JSON and nothing else.
//
// Usage:
//   collect.mjs --session <uuid> [--since <ISO>] [--until <ISO>] [--plan <NNN>] [--baseline] [--record]
//               [--out <file>] [--gap-ms 180000]
//   collect.mjs --list [--limit 10]
//   --session   a session of this project: ~/.claude/projects/<project>/<uuid>.jsonl (no arbitrary paths)
//   --plan      window + stage timings from .git/run-plan/<NNN>/state.json, step/test counts from the plan
//   --baseline  compare with the history in docs/retro/ledger/metrics.jsonl (medians, ratio per metric)
//   --record    append this run's summary to docs/retro/ledger/metrics.jsonl (once per session+window)
//   --out       write the full JSON to <file> (temp dir only) and print only { ok, out, summary }
// Writes nothing except --record and --out. Turns that ran /workflow-retro itself are excluded.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
};
const flag = (name) => argv.includes(name);
const die = (error, extra = {}) => {
  console.log(JSON.stringify({ ok: false, error, ...extra }, null, 2));
  process.exit(1);
};

const ROOT = process.env.RETRO_ROOT ?? (() => {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return process.cwd();
  }
})();
const PROJECTS = process.env.RETRO_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects', ROOT.replace(/[^a-zA-Z0-9]/g, '-'));
const METRICS = join(ROOT, 'docs', 'retro', 'ledger', 'metrics.jsonl');
const GAP_MS = Number(opt('--gap-ms') ?? 180_000);
const RETRO_MARK = '<command-name>/workflow-retro</command-name>';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------- helpers ----------

function readJsonl(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* a partially written last line */
    }
  }
  return out;
}
const ms = (ts) => Date.parse(ts);
const contentOf = (e) => {
  const c = e?.message?.content;
  return Array.isArray(c) ? c : typeof c === 'string' ? [{ type: 'text', text: c }] : [];
};
// Text is read only to classify (regex) — it is never copied into the output.
const textOf = (b) =>
  typeof b?.content === 'string' ? b.content : Array.isArray(b?.content) ? b.content.map((c) => c.text ?? '').join('\n') : (b?.text ?? '');
const lines = (s) => (typeof s === 'string' && s.length ? s.split('\n').length : 0);
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(d)));
const label = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60);

const SENSITIVE_PATH = /(?:^|\/)\.env|secret|credential|password|\.pem$|\.key$|id_rsa|\.ssh\/|\.aws\/|\.npmrc$/i;
/** Repo-relative path, '<sensitive>' for secret-like files, null outside the repo. */
function repoPath(p, cwd = ROOT) {
  if (typeof p !== 'string' || !p) return null;
  const rel = relative(ROOT, resolve(cwd, p)).split(sep).join('/');
  if (!rel || rel.startsWith('..')) return null;
  return SENSITIVE_PATH.test(rel) ? '<sensitive>' : rel;
}

// Intervals: [start, end] in epoch ms.
function merge(iv) {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
const total = (iv) => merge(iv).reduce((s, [a, b]) => s + b - a, 0);
function subtract(iv, cut) {
  let out = merge(iv);
  for (const [c0, c1] of merge(cut)) {
    out = out.flatMap(([a, b]) => (c1 <= a || c0 >= b ? [[a, b]] : [...(a < c0 ? [[a, c0]] : []), ...(c1 < b ? [[c1, b]] : [])]));
  }
  return out;
}
function segmentsOf(stamps) {
  const segs = [];
  for (const t of [...stamps].sort((a, b) => a - b)) {
    const g = segs.at(-1);
    if (g && t - g[1] <= GAP_MS) g[1] = t;
    else segs.push([t, t]);
  }
  return segs;
}

// ---------- pricing ----------

const PRICING = (() => {
  try {
    return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'pricing.json'), 'utf8')).models ?? {};
  } catch {
    return {};
  }
})();
const priceKey = (model) => String(model).replace(/\[.*\]$/, '').replace(/-\d{8}$/, '');
function costOf(u, model, unpriced) {
  const p = PRICING[priceKey(model)];
  if (!p) {
    unpriced.add(priceKey(model));
    return 0;
  }
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens;
  const w5m = u.cache_creation?.ephemeral_5m_input_tokens;
  const cw = u.cache_creation_input_tokens ?? 0;
  const write = w1h != null || w5m != null ? (w5m ?? 0) * p.cacheWrite5m + (w1h ?? 0) * p.cacheWrite1h : cw * p.cacheWrite5m;
  return ((u.input_tokens ?? 0) * p.input + (u.cache_read_input_tokens ?? 0) * p.cacheRead + write + (u.output_tokens ?? 0) * p.output) / 1e6;
}

// ---------- classification (regex in, label out) ----------

const SAFE_WORD = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,30}$/;
const VALUE_FLAGS = new Set(['-C', '--dir', '--filter', '-F', '--prefix', '-c']);
/** "pnpm test", "git diff", "node collect.mjs", "rg" — never arguments. */
function bashKind(cmd) {
  const segs = String(cmd).split(/&&|\|\||;|\n|\|/).map((s) => s.trim()).filter((s) => s && !/^cd\s/.test(s));
  const t = (segs[0] ?? '').split(/\s+/).filter(Boolean);
  while (t.length && /^[A-Za-z_]\w*=/.test(t[0])) t.shift(); // env-var prefixes (values may be secrets)
  if (t[0] === 'timeout') t.splice(0, 2);
  const head = basename(t[0] ?? '');
  if (!SAFE_WORD.test(head)) return 'other';
  const words = [];
  for (let i = 1; i < t.length && words.length < 2; i++) {
    if (VALUE_FLAGS.has(t[i])) { i++; continue; }
    if (t[i].startsWith('-')) continue;
    words.push(t[i]);
    if (!['exec', 'run', 'dlx', 'x'].includes(t[i])) break;
  }
  if (head === 'node' || head === 'tsx') {
    const script = basename(words[0] ?? '');
    return SAFE_WORD.test(script) ? `${head} ${script}` : head;
  }
  if (['pnpm', 'npm', 'npx', 'yarn', 'git', 'gh', 'docker', 'make', 'cargo', 'go'].includes(head)) {
    const sub = words.filter((w) => SAFE_WORD.test(w) && !w.includes('/'));
    return [head, ...sub].join(' ');
  }
  return head;
}

/** Paths read from Bash (cat/head/tail/sed -n/less/nl), for duplicate-read detection. */
function bashReads(cmd, cwd) {
  const out = [];
  for (const seg of String(cmd).split(/&&|\|\||;|\n|\|/)) {
    const t = seg.trim().replace(/'[^']*'|"[^"]*"/g, '').split(/\s+/).filter(Boolean);
    if (t[0] === 'cd' && t[1]) cwd = resolve(cwd, t[1]); // `cd client && cat src/a.ts`
    if (!['cat', 'head', 'tail', 'sed', 'less', 'nl', 'bat'].includes(t[0])) continue;
    for (const a of t.slice(1)) if (!a.startsWith('-') && /[/.]/.test(a) && !/^\d/.test(a)) {
      const p = repoPath(a, cwd);
      if (p) out.push(p);
    }
  }
  return out;
}

const DENIAL_CATEGORIES = [
  ['permission', /doesn't want to proceed|user (?:rejected|denied)|permission to use .* (?:denied|was not granted)/i],
  ['allowlist', /allowlist/i],
  ['shell-write', /shell write|redirect|tee into|sed -i|perl -i|in-place/i],
  ['interpreter', /interpreter|nested shell|\beval\b/i],
  ['substitution', /substitution/i],
  ['path', /outside the (?:paths|repository)|protected|read-only|may not write|symlink|append-only/i],
  ['tool', /not available/i],
  ['spawn', /may not spawn/i],
  ['skill', /may not load skill/i],
  ['git', /git write|gh pr/i],
  ['delete', /recursive delete/i],
];
/**
 * "agent-guard:test-writer/allowlist:for" from a hook message and, for Bash, the first word of the denied
 * command's kind (bashKind: a safe word or 'other', never arguments); null when the error is not a denial.
 */
function denialKey(text, kind) {
  const cat = DENIAL_CATEGORIES.find(([, re]) => re.test(text))?.[0];
  if (!cat && !/hook|guard|blocked|denied/i.test(text)) return null;
  const m = text.match(/\[node "[^"]*?([\w-]+)\.mjs"(?:\s+([\w-]+))?\]/);
  const guard = m ? (m[2] ? `${m[1]}:${m[2]}` : m[1]) : cat === 'permission' ? 'user' : 'hook';
  const head = kind ? kind.split(' ')[0] : null;
  return `${guard}/${cat ?? 'other'}${head ? `:${head}` : ''}`;
}

// ---------- session resolution ----------

function sessionFile(id) {
  if (!UUID.test(id ?? '')) die('--session must be a session uuid of this project (see --list)');
  const f = join(PROJECTS, `${id}.jsonl`);
  if (!existsSync(f)) die(`session ${id} not found in ${PROJECTS}`);
  return f;
}

/** Time ranges of turns that ran /workflow-retro: from its prompt to the next human prompt. */
function retroRanges(entries) {
  const humans = entries.filter((e) => e.type === 'user' && e.origin?.kind === 'human' && e.timestamp);
  return humans
    .map((e, i) => (JSON.stringify(e.message?.content ?? '').includes(RETRO_MARK) ? [ms(e.timestamp), humans[i + 1] ? ms(humans[i + 1].timestamp) - 1 : Infinity] : null))
    .filter(Boolean);
}

// ---------- --list ----------

if (flag('--list')) {
  if (!existsSync(PROJECTS)) die(`no transcripts in ${PROJECTS}`);
  const limit = Number(opt('--limit') ?? 10);
  const sessions = readdirSync(PROJECTS)
    .filter((f) => UUID.test(f.replace(/\.jsonl$/, '')) && f.endsWith('.jsonl'))
    .map((f) => ({ f, m: statSync(join(PROJECTS, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, limit)
    .map(({ f }) => {
      const id = f.replace(/\.jsonl$/, '');
      const entries = readJsonl(join(PROJECTS, f));
      const stamps = entries.map((e) => e.timestamp).filter(Boolean).sort();
      const sub = join(PROJECTS, id, 'subagents');
      const agents = existsSync(sub) ? readdirSync(sub).filter((x) => x.endsWith('.meta.json')).length : 0;
      const prompts = entries.filter((e) => e.type === 'user' && e.origin?.kind === 'human').length;
      return { session: id, startedAt: stamps[0] ?? null, endedAt: stamps.at(-1) ?? null, prompts, agents, retroRuns: retroRanges(entries).length };
    })
    .filter((s) => s.prompts > 0);
  console.log(JSON.stringify({ ok: true, projectDir: PROJECTS, sessions }, null, 2));
  process.exit(0);
}

// ---------- window ----------

const sessionId = opt('--session');
const transcript = sessionFile(sessionId);
const mainEntries = readJsonl(transcript);

let since = opt('--since');
let until = opt('--until');
let plan = null;
const planId = opt('--plan');
if (planId) {
  if (!/^\d{3}$/.test(planId)) die('--plan takes the 3-digit plan number, e.g. 006');
  const stateFile = join(ROOT, '.git', 'run-plan', planId, 'state.json');
  if (!existsSync(stateFile)) die(`no run-plan state for plan ${planId} (${stateFile})`);
  const st = JSON.parse(readFileSync(stateFile, 'utf8'));
  const planFile = existsSync(join(ROOT, 'docs', 'plans')) ? readdirSync(join(ROOT, 'docs', 'plans')).find((f) => f.startsWith(`${planId}-`)) : undefined;
  const planText = planFile ? readFileSync(join(ROOT, 'docs', 'plans', planFile), 'utf8') : '';
  const specRel = planText.match(/(?:[a-z-]+\/)?specs\/\d{3}-[a-z0-9-]+\.md/)?.[0];
  const specText = specRel && existsSync(join(ROOT, specRel)) ? readFileSync(join(ROOT, specRel), 'utf8') : '';
  const stages = (st.stages ?? []).map((s, i, all) => ({
    name: label(s.name),
    status: label(s.status),
    at: s.at,
    durationMs: ms(s.at) - ms(i ? all[i - 1].at : st.startedAt),
  }));
  plan = {
    id: planId,
    slug: planFile ? planFile.replace(/^\d{3}-|\.md$/g, '') : null,
    mode: st.plan?.mode ?? null,
    packages: Array.isArray(st.plan?.packages) ? st.plan.packages.length : null,
    steps: new Set(planText.match(/^###\s+S\d+\b/gm) ?? []).size,
    tests: new Set(planText.match(/^\|\s*T-\d+\b/gm)?.map((x) => x.replace(/\W/g, '')) ?? []).size,
    acceptanceCriteria: new Set(specText.match(/\bAC-\d+\b/g) ?? []).size || null,
    startedAt: st.startedAt,
    stages,
    fixRounds: stages.filter((s) => /^fix-\d+$/.test(s.name)).length,
    leadTimeMs: stages.length ? ms(stages.at(-1).at) - ms(st.startedAt) : null,
  };
  since ??= st.startedAt;
  until ??= stages.at(-1)?.at;
}
const excluded = retroRanges(mainEntries);
const inWindow = (ts) => {
  if (!ts) return false;
  if ((since && ts < since) || (until && ts > until)) return false;
  const t = ms(ts);
  return !excluded.some(([a, b]) => t >= a && t <= b);
};

// ---------- per-transcript analysis ----------

const unpriced = new Set();
const emptyUsage = () => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, total: 0, requests: 0, costUsd: 0 });

function analyse(entries) {
  const usage = emptyUsage();
  const models = {};
  const tools = {};
  const toolErrors = {};
  const denials = {};
  const bash = {};
  const calls = []; // { tool, kind, start, end }
  const pending = new Map();
  const reads = new Set();
  const written = new Set();
  let linesAdded = 0;
  let linesRemoved = 0;
  let outsideRepoWrites = 0;
  let peakContext = 0;
  let contextSum = 0;
  const seen = new Set();
  const stamps = [];
  // One assistant message is written as several entries (same message.id, a later timestamp per block).
  // Most tools run only after the whole message has streamed, so a call starts at the message's LAST
  // entry. Read-only tools (Read/Grep/Glob…) may start as soon as their own block is complete and finish
  // while the message is still streaming; such a call is clipped to 0 ms — tool time is the wait for a
  // tool beyond the generation, never negative.
  const messageEnd = new Map();
  for (const e of entries) {
    if (e.type !== 'assistant' || !e.message?.id || !inWindow(e.timestamp)) continue;
    messageEnd.set(e.message.id, Math.max(messageEnd.get(e.message.id) ?? 0, ms(e.timestamp)));
  }
  for (const e of entries) {
    if (!inWindow(e.timestamp)) continue;
    const t = ms(e.timestamp);
    stamps.push(t);
    if (e.type === 'assistant') {
      const m = e.message ?? {};
      const start = Math.max(t, messageEnd.get(m.id) ?? t);
      const key = m.id ?? e.requestId ?? e.uuid;
      if (m.usage && !seen.has(key)) {
        seen.add(key);
        const u = m.usage;
        const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        usage.input += u.input_tokens ?? 0;
        usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
        usage.cacheRead += u.cache_read_input_tokens ?? 0;
        usage.output += u.output_tokens ?? 0;
        usage.thinking += u.output_tokens_details?.thinking_tokens ?? 0;
        usage.requests += 1;
        usage.costUsd += costOf(u, m.model ?? 'unknown', unpriced);
        peakContext = Math.max(peakContext, ctx);
        contextSum += ctx;
        if (m.model) models[m.model] = (models[m.model] ?? 0) + 1;
      }
      for (const b of contentOf(e)) {
        if (b.type !== 'tool_use') continue;
        const name = String(b.name);
        tools[name] = (tools[name] ?? 0) + 1;
        const input = b.input ?? {};
        const kind = name === 'Bash' ? bashKind(input.command) : null;
        pending.set(b.id, { tool: name, kind, start });
        if (name === 'Read') {
          const p = repoPath(input.file_path);
          if (p) reads.add(p);
        }
        if (name === 'Bash') for (const p of bashReads(input.command, e.cwd ?? ROOT)) reads.add(p);
        if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') {
          const p = repoPath(input.file_path ?? input.notebook_path);
          if (p) written.add(p);
          else outsideRepoWrites += 1;
          if (name === 'Write') linesAdded += lines(input.content);
          if (name === 'Edit') {
            linesAdded += lines(input.new_string);
            linesRemoved += lines(input.old_string);
          }
        }
      }
    }
    if (e.type === 'user') {
      for (const b of contentOf(e)) {
        if (b.type !== 'tool_result') continue;
        const call = pending.get(b.tool_use_id);
        if (call) {
          pending.delete(b.tool_use_id);
          call.end = t;
          call.start = Math.min(call.start, t);
          calls.push(call);
        }
        if (!b.is_error) continue;
        const dk = denialKey(textOf(b), call?.kind);
        if (dk) denials[dk] = (denials[dk] ?? 0) + 1;
        else if (call) toolErrors[call.tool] = (toolErrors[call.tool] ?? 0) + 1;
      }
    }
  }
  usage.total = usage.input + usage.cacheWrite + usage.cacheRead + usage.output;
  const segs = segmentsOf(stamps);
  const active = total(segs);
  // A call that spans an idle gap (a resume, a background wait) measures the gap, not the tool: it stays
  // out of the slowest-call lists and the per-kind Bash ms (toolMs below already clips it to the segments).
  for (const c of calls) {
    c.spansGap = c.end - c.start > GAP_MS || !segs.some(([a, b]) => c.start >= a && c.end <= b);
    if (!c.kind) continue;
    const k = (bash[c.kind] ??= { count: 0, ms: 0 });
    k.count += 1;
    if (!c.spansGap) k.ms += c.end - c.start;
  }
  const toolIv = merge(calls.map((c) => [c.start, c.end]));
  // Tool time inside active segments only (a call that spans an idle gap — e.g. a background wait — is not work).
  const span = stamps.length ? [[Math.min(...stamps), Math.max(...stamps)]] : [];
  const toolMs = total(subtract(toolIv, subtract(span, segs)));
  return {
    usage, models, tools, toolErrors, denials, bash, calls, reads, written, linesAdded, linesRemoved, outsideRepoWrites,
    peakContext, avgContext: usage.requests ? Math.round(contextSum / usage.requests) : 0,
    first: stamps.length ? Math.min(...stamps) : null, last: stamps.length ? Math.max(...stamps) : null,
    segs, activeMs: active, toolMs: Math.min(toolMs, active), modelMs: Math.max(0, active - toolMs),
  };
}

// ---------- main thread ----------

const main = analyse(mainEntries);
const spawns = new Map();
const resumes = {};
const skills = {};
let questions = 0;
let userPrompts = 0;
let compactions = 0;
const userWait = [];
const agentWait = [];
const turnLimit = [];
let prevTs = null;
const askPending = new Map();
for (const e of mainEntries) {
  if (!inWindow(e.timestamp)) continue;
  const t = ms(e.timestamp);
  if (e.type === 'system' && /compact/i.test(String(e.subtype ?? ''))) compactions += 1;
  if (e.type === 'user' && prevTs != null && t - prevTs > 1000) {
    if (e.origin?.kind === 'human') userWait.push([prevTs, t]);
    else if (e.origin?.kind === 'task-notification' || e.origin?.kind === 'peer') agentWait.push([prevTs, t]);
  }
  if (e.type === 'user' && e.origin?.kind === 'human') userPrompts += 1;
  // Idle gaps are measured from the last model / tool activity — queue operations, attachments and
  // notifications that land right before a prompt are bookkeeping, not work.
  const activity = e.type === 'assistant' || (e.type === 'user' && contentOf(e).some((b) => b.type === 'tool_result'));
  for (const b of contentOf(e)) {
    if (e.type === 'assistant' && b.type === 'tool_use') {
      if (b.name === 'Agent' || b.name === 'Task') spawns.set(b.id, { at: e.timestamp, promptChars: String(b.input?.prompt ?? '').length });
      if (b.name === 'SendMessage' && b.input?.to) resumes[b.input.to] = (resumes[b.input.to] ?? 0) + 1;
      if (b.name === 'Skill') skills[label(b.input?.skill)] = (skills[label(b.input?.skill)] ?? 0) + 1;
      if (b.name === 'AskUserQuestion') {
        questions += 1;
        askPending.set(b.id, t);
      }
    }
    if (e.type === 'user' && b.type === 'tool_result' && askPending.has(b.tool_use_id)) {
      userWait.push([askPending.get(b.tool_use_id), t]);
      askPending.delete(b.tool_use_id);
    }
    if (e.type === 'user' && e.origin?.kind === 'task-notification') {
      const m = /stopped at its (\d+)-turn limit/.exec(textOf(b));
      const id = /<task-id>([\w-]+)<\/task-id>/.exec(textOf(b))?.[1];
      if (m) turnLimit.push({ agentId: id ?? null, limit: Number(m[1]), at: e.timestamp });
    }
  }
  if (activity || (e.type === 'user' && e.origin?.kind)) prevTs = t;
}
const mainActive = subtract(main.segs, userWait);
const WAITING_TOOLS = new Set(['Agent', 'Task', 'AskUserQuestion', 'SendMessage']);
const insideMain = (iv) => total(subtract(merge(iv), subtract([[main.first ?? 0, main.last ?? 0]], mainActive)));
const mainToolMs = insideMain(main.calls.filter((c) => !WAITING_TOOLS.has(c.tool)).map((c) => [c.start, c.end]));
const mainForegroundAgentMs = insideMain(main.calls.filter((c) => c.tool === 'Agent' || c.tool === 'Task').map((c) => [c.start, c.end]));

// ---------- subagents ----------

const subDir = join(transcript.replace(/\.jsonl$/, ''), 'subagents');
const agents = [];
if (existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((x) => x.endsWith('.meta.json'))) {
    const id = basename(f, '.meta.json').replace(/^agent-/, '');
    const jsonl = join(subDir, `agent-${id}.jsonl`);
    if (!existsSync(jsonl)) continue;
    let meta = {};
    try {
      meta = JSON.parse(readFileSync(join(subDir, f), 'utf8'));
    } catch {
      /* missing meta: type unknown */
    }
    const a = analyse(readJsonl(jsonl));
    if (a.first == null) continue;
    const spawn = spawns.get(meta.toolUseId);
    const spawnedAt = spawn ? ms(spawn.at) : a.first;
    agents.push({
      id,
      type: label(meta.agentType ?? 'unknown'),
      depth: meta.spawnDepth ?? 1,
      label: label(meta.description),
      spawnedAt: new Date(spawnedAt).toISOString(),
      first: new Date(a.first).toISOString(),
      last: new Date(a.last).toISOString(),
      startDelayMs: a.first - spawnedAt,
      spanMs: a.last - a.first,
      activeMs: a.activeMs,
      modelMs: a.modelMs,
      toolMs: a.toolMs,
      segments: a.segs.length,
      requests: a.usage.requests,
      promptChars: spawn?.promptChars ?? null,
      resumes: (resumes[id] ?? 0) + (meta.description ? (resumes[meta.description] ?? 0) : 0),
      turnLimitHit: turnLimit.some((x) => x.agentId === id),
      finished: meta.finished ?? null,
      models: a.models,
      usage: Object.fromEntries(Object.entries(a.usage).map(([k, v]) => [k, k === 'costUsd' ? round(v, 4) : v])),
      peakContext: a.peakContext,
      avgContext: a.avgContext,
      outputTokPerSec: a.modelMs ? round(a.usage.output / (a.modelMs / 1000), 1) : null,
      toolCalls: a.calls.length,
      tools: a.tools,
      bash: a.bash,
      slowestCalls: a.calls.filter((c) => !c.spansGap).sort((x, y) => y.end - y.start - (x.end - x.start)).slice(0, 3)
        .map((c) => ({ tool: c.tool, kind: c.kind, ms: c.end - c.start })),
      denials: a.denials,
      toolErrors: a.toolErrors,
      filesWritten: a.written.size,
      linesAdded: a.linesAdded,
      linesRemoved: a.linesRemoved,
      outsideRepoWrites: a.outsideRepoWrites,
      _segs: a.segs,
      _reads: a.reads,
      _written: a.written,
      _calls: a.calls,
    });
  }
}
agents.sort((x, y) => (x.spawnedAt < y.spawnedAt ? -1 : 1));

// ---------- aggregates ----------

const allIv = (xs) => xs.flatMap((a) => a._segs);
const agentIv = merge(allIv(agents));
const first = Math.min(...[main.first, ...agents.map((a) => ms(a.first))].filter((x) => x != null));
const last = Math.max(...[main.last, ...agents.map((a) => ms(a.last))].filter((x) => x != null));
if (!Number.isFinite(first)) die('nothing inside the window', { since, until });
const wallClockMs = last - first;
// Wall clock = mainActive + agentsOnly + userWait + idle (no overlaps): time the human took while
// agents were still working counts as agent time, not as waiting for the user.
const userWaitPure = subtract(userWait, agentIv);
const userWaitMs = total(userWaitPure);
const mainActiveMs = total(mainActive);
const agentsOnlyMs = total(subtract(agentIv, mainActive));
const idleMs = Math.max(0, wallClockMs - total([...mainActive, ...userWaitPure, ...agentIv]));

const waves = [];
for (const g of agents.flatMap((a) => a._segs.map((s) => ({ s, label: `${a.type}:${a.id.slice(0, 7)}` }))).sort((x, y) => x.s[0] - y.s[0])) {
  const w = waves.at(-1);
  if (w && g.s[0] <= w.last) {
    if (!w.agents.includes(g.label)) w.agents.push(g.label);
    w.last = Math.max(w.last, g.s[1]);
  } else waves.push({ first: g.s[0], last: g.s[1], agents: [g.label] });
}
const wavesOut = waves.map((w) => ({ first: new Date(w.first).toISOString(), last: new Date(w.last).toISOString(), wallClockMs: w.last - w.first, agents: w.agents }));
const agentTimeMs = agents.reduce((s, a) => s + a.activeMs, 0);
const criticalPathMs = total(agentIv);

const sumUsage = (xs) => {
  const u = emptyUsage();
  for (const x of xs) for (const k of Object.keys(u)) u[k] += x[k] ?? 0;
  u.costUsd = round(u.costUsd, 4);
  return u;
};
const subUsage = sumUsage(agents.map((a) => a.usage));
const mainUsage = sumUsage([main.usage]);
const grand = sumUsage([main.usage, ...agents.map((a) => a.usage)]);

const byType = {};
for (const a of agents) {
  const t = (byType[a.type] ??= { runs: 0, tokens: 0, output: 0, costUsd: 0, activeMs: 0, modelMs: 0, toolMs: 0, toolCalls: 0, requests: 0, peakContext: 0, denials: 0, toolErrors: 0, turnLimitHits: 0, resumes: 0, filesWritten: 0 });
  t.runs += 1;
  t.tokens += a.usage.total;
  t.output += a.usage.output;
  t.costUsd = round(t.costUsd + a.usage.costUsd, 4);
  t.activeMs += a.activeMs;
  t.modelMs += a.modelMs;
  t.toolMs += a.toolMs;
  t.toolCalls += a.toolCalls;
  t.requests += a.requests;
  t.peakContext = Math.max(t.peakContext, a.peakContext);
  t.denials += Object.values(a.denials).reduce((s, n) => s + n, 0);
  t.toolErrors += Object.values(a.toolErrors).reduce((s, n) => s + n, 0);
  t.turnLimitHits += a.turnLimitHit ? 1 : 0;
  t.resumes += a.resumes;
  t.filesWritten += a.filesWritten;
}

const bashAll = {};
for (const src of [main.bash, ...agents.map((a) => a.bash)]) for (const [k, v] of Object.entries(src)) {
  const b = (bashAll[k] ??= { count: 0, ms: 0 });
  b.count += v.count;
  b.ms += v.ms;
}
const slowCalls = [...main.calls.map((c) => ({ ...c, who: 'main' })), ...agents.flatMap((a) => a._calls.map((c) => ({ ...c, who: `${a.type}:${a.id.slice(0, 7)}` })))]
  .filter((c) => !c.spansGap && !WAITING_TOOLS.has(c.tool))
  .sort((x, y) => y.end - y.start - (x.end - x.start))
  .slice(0, 10)
  .map((c) => ({ who: c.who, tool: c.tool, kind: c.kind, ms: c.end - c.start }));

const readers = new Map();
for (const p of main.reads) readers.set(p, new Set(['main']));
for (const a of agents) for (const p of a._reads) {
  if (!readers.has(p)) readers.set(p, new Set());
  readers.get(p).add(`${a.type}:${a.id.slice(0, 7)}`);
}
const duplicateReads = [...readers.entries()].filter(([p, s]) => s.size > 1 && p !== '<sensitive>')
  .map(([path, s]) => ({ path, readers: s.size, by: [...s] }))
  .sort((x, y) => y.readers - x.readers)
  .slice(0, 20);

const filesChanged = new Set([...main.written, ...agents.flatMap((a) => [...a._written])]);
const linesAdded = main.linesAdded + agents.reduce((s, a) => s + a.linesAdded, 0);
const linesRemoved = main.linesRemoved + agents.reduce((s, a) => s + a.linesRemoved, 0);
const countDenials = (d) => Object.values(d).reduce((s, n) => s + n, 0);
const toolCalls = main.calls.length + agents.reduce((s, a) => s + a.toolCalls, 0);
const denialsTotal = countDenials(main.denials) + agents.reduce((s, a) => s + countDenials(a.denials), 0);
const denialsByKey = {};
for (const d of [main.denials, ...agents.map((a) => a.denials)]) for (const [k, n] of Object.entries(d)) denialsByKey[k] = (denialsByKey[k] ?? 0) + n;

const totals = {
  agents: agents.length,
  agentsByDepth: agents.reduce((m, a) => ({ ...m, [a.depth]: (m[a.depth] ?? 0) + 1 }), {}),
  tokens: { main: mainUsage, subagents: subUsage, grand },
  cacheReadShare: grand.total ? round(grand.cacheRead / grand.total, 3) : 0,
  costUsd: { main: mainUsage.costUsd, subagents: subUsage.costUsd, total: grand.costUsd, estimate: true, unpricedModels: [...unpriced] },
  time: {
    wallClockMs,
    mainActiveMs,
    agentsOnlyMs,
    userWaitMs,
    idleMs,
    agentWaitMs: total(agentWait),
    agentTimeMs,
    criticalPathMs,
    parallelism: criticalPathMs ? round(agentTimeMs / criticalPathMs) : null,
    mainModelMs: Math.max(0, mainActiveMs - mainToolMs - mainForegroundAgentMs),
    mainToolMs,
    mainForegroundAgentMs,
  },
  counts: {
    userPrompts,
    questionsToUser: questions,
    resumes: Object.values(resumes).reduce((s, n) => s + n, 0),
    toolCalls,
    toolErrors: Object.values(main.toolErrors).reduce((s, n) => s + n, 0) + agents.reduce((s, a) => s + Object.values(a.toolErrors).reduce((x, n) => x + n, 0), 0),
    denials: denialsTotal,
    turnLimitHits: turnLimit.length,
    compactions,
    skills,
  },
  delivery: { filesChanged: filesChanged.size, linesAdded, linesRemoved, outsideRepoWrites: main.outsideRepoWrites + agents.reduce((s, a) => s + a.outsideRepoWrites, 0) },
};
const perUnit = (v, n) => (n ? round(v / n, 2) : null);
const ratios = {
  costPerChangedFile: perUnit(grand.costUsd, filesChanged.size),
  tokensPerChangedFile: perUnit(grand.total, filesChanged.size),
  outputTokensPer100Lines: perUnit(grand.output * 100, linesAdded),
  denialsPer100ToolCalls: perUnit(denialsTotal * 100, toolCalls),
  userWaitShare: perUnit(userWaitMs, wallClockMs),
  ...(plan?.steps ? {
    minutesPerPlanStep: round((plan.leadTimeMs ?? wallClockMs) / 60000 / plan.steps, 1),
    costPerPlanStep: perUnit(grand.costUsd, plan.steps),
    tokensPerPlanStep: perUnit(grand.total, plan.steps),
  } : {}),
  ...(plan?.tests ? { costPerTest: perUnit(grand.costUsd, plan.tests) } : {}),
};

const summary = {
  schema: 2,
  session: sessionId,
  since: new Date(first).toISOString(),
  until: new Date(last).toISOString(),
  plan: plan ? { id: plan.id, steps: plan.steps, tests: plan.tests, fixRounds: plan.fixRounds, leadTimeMs: plan.leadTimeMs } : null,
  totals: {
    agents: totals.agents,
    tokens: grand.total,
    output: grand.output,
    costUsd: grand.costUsd,
    wallClockMs,
    agentTimeMs,
    criticalPathMs,
    parallelism: totals.time.parallelism,
    userWaitMs,
    toolCalls,
    denials: denialsTotal,
    filesChanged: filesChanged.size,
  },
  ratios,
  byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { runs: v.runs, tokens: v.tokens, costUsd: v.costUsd, activeMs: v.activeMs, toolCalls: v.toolCalls, denials: v.denials }])),
};

// ---------- baseline ----------

let baseline = null;
if (flag('--baseline')) {
  const history = existsSync(METRICS) ? readJsonl(METRICS).filter((r) => r.schema === 2 && !(r.session === sessionId && r.since === summary.since)) : [];
  const cmp = (cur, xs) => {
    const med = median(xs);
    const ratio = med ? round(cur / med) : null;
    return { current: cur, median: med, n: xs.filter(Number.isFinite).length, ratio, verdict: ratio == null || xs.length < 2 ? 'no-baseline' : ratio >= 1.5 ? 'slower' : ratio <= 0.67 ? 'faster' : 'typical' };
  };
  const perRun = (type, key) => history.map((r) => r.byType?.[type]).filter(Boolean).map((t) => t[key] / t.runs);
  baseline = {
    runs: history.length,
    totals: Object.fromEntries(['wallClockMs', 'costUsd', 'tokens', 'parallelism', 'userWaitMs', 'denials'].map((k) => [k, cmp(summary.totals[k], history.map((r) => r.totals?.[k]))])),
    ratios: Object.fromEntries(Object.keys(ratios).map((k) => [k, cmp(ratios[k], history.map((r) => r.ratios?.[k]))])),
    byType: Object.fromEntries(Object.entries(byType).map(([type, t]) => [type, {
      activeMsPerRun: cmp(t.activeMs / t.runs, perRun(type, 'activeMs')),
      tokensPerRun: cmp(t.tokens / t.runs, perRun(type, 'tokens')),
      toolCallsPerRun: cmp(t.toolCalls / t.runs, perRun(type, 'toolCalls')),
    }])),
  };
}

// ---------- record ----------

let recorded = null;
if (flag('--record')) {
  if (!existsSync(dirname(METRICS))) die(`ledger folder missing: ${dirname(METRICS)}`);
  const dup = existsSync(METRICS) && readJsonl(METRICS).some((r) => r.session === sessionId && r.since === summary.since && r.until === summary.until);
  if (dup) recorded = { path: relative(ROOT, METRICS), skipped: 'already recorded' };
  else {
    appendFileSync(METRICS, `${JSON.stringify({ ...summary, recordedAt: new Date().toISOString() })}\n`);
    recorded = { path: relative(ROOT, METRICS), appended: true };
  }
}

// ---------- output ----------

const out = {
  ok: true,
  schema: 2,
  session: sessionId,
  window: { since: summary.since, until: summary.until, requestedSince: since ?? null, requestedUntil: until ?? null, excludedRetroTurns: excluded.length },
  plan,
  totals,
  ratios,
  byType,
  hotspots: {
    slowestAgents: [...agents].sort((x, y) => y.activeMs - x.activeMs).slice(0, 5).map((a) => ({ agent: `${a.type}:${a.id.slice(0, 7)}`, label: a.label, activeMs: a.activeMs, toolMs: a.toolMs, modelMs: a.modelMs })),
    bashKinds: Object.entries(bashAll).sort((x, y) => y[1].ms - x[1].ms).slice(0, 10).map(([kind, v]) => ({ kind, ...v })),
    slowestCalls: slowCalls,
    denialsByGuard: denialsByKey,
    userWaits: userWaitPure.filter(([a, b]) => b - a > 120_000).map(([a, b]) => ({ at: new Date(a).toISOString(), ms: b - a })),
  },
  waves: wavesOut,
  agents: agents.map(({ _segs, _reads, _written, _calls, ...rest }) => rest),
  main: { usage: mainUsage, models: main.models, tools: main.tools, bash: main.bash, denials: main.denials, toolErrors: main.toolErrors, peakContext: main.peakContext },
  turnLimitHits: turnLimit,
  duplicateReads,
  baseline,
  recorded,
  summary,
};

const outFile = opt('--out');
if (outFile) {
  const abs = resolve(outFile);
  const tmps = [...new Set([resolve(tmpdir()), '/tmp'])];
  if (!tmps.some((t) => abs.startsWith(t + sep)) || !/^workflow-retro[\w.-]*\.json$/.test(basename(abs))) {
    die('--out must be <temp dir or scratchpad>/workflow-retro*.json');
  }
  writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, out: abs, summary, baseline: baseline ? { runs: baseline.runs } : null, recorded }, null, 2));
} else {
  console.log(JSON.stringify(out, null, 2));
}
