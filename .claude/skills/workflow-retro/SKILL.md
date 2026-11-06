---
name: workflow-retro
description: "Performance retrospective of a finished multi-agent workflow (/run-plan, spec-creator → implementation-planner → run-plan → plan-verifier chains, Workflow scripts, ad-hoc fan-outs): wall clock and where the time went (agents, main thread, waiting for the user), tokens and estimated cost, parallelism, the slowest agents, tools and commands, waste (duplicate reads, hook denials, retries, turn-limit stops, context bloat), product metrics (lead time, time and cost per plan step / test / changed file, fix rounds) and comparison with earlier runs; ranked recommendations with expected savings. Metadata only: it never reads, analyses or quotes prompts, code, diffs, agent reports or tool output. Output: chat report + docs/retro/ledger/runs.md entry + metrics.jsonl row. Use only when the user types /workflow-retro."
argument-hint: "[--plan NNN] [--session <uuid> | --list] [--since <ISO>] [--until <ISO>] [--no-baseline] [--no-write]"
disable-model-invocation: true
# Removed from the tool pool for this turn; the hook below is the enforcing layer (default-deny, MCP included).
disallowed-tools:
  - Agent
  - Workflow
  - Skill
  - WebFetch
  - WebSearch
  - NotebookEdit
hooks:
  PreToolUse:
    - matcher: "*"
      hooks:
        - type: command
          command: node "$CLAUDE_PROJECT_DIR/.claude/hooks/agent-guard.mjs" workflow-retro
metadata:
  version: "2.0.0"
  tags: "retrospective, performance, orchestration, tokens, cost, product-metrics, ledger"
---

# Workflow retro

A performance retrospective of one multi-agent run, for whoever tunes the agents and the
orchestration next. It answers:

1. **How long did it take, and where did the time go?** Agents, main thread, waiting for the user, idle.
2. **What did it cost?** Tokens, cache efficiency, ~USD.
3. **What was slow, what was fast, and why?** Judged from the numbers and compared with earlier runs.
4. **What should change** so the next run is faster or cheaper, and by how much?

It complements the other end-of-task steps:

| | Looks at | Writes to |
|---|---|---|
| `engineering-insights` | the **product code**: gotchas of a package | `<pkg>/INSIGHTS.md` |
| `plan-verifier` | the **result** against the plan and spec | chat (traceability matrix) |
| **`workflow-retro`** | the **process performance**: time, tokens, cost, flow, friction | chat + `docs/retro/ledger/` |

## Privacy model: metadata only

The single source is the JSON of `scripts/collect.mjs` (schema 2). It reads the transcripts and
prints **only**:
- timestamps and durations;
- token usage and a cost estimate;
- tool names, call counts and call durations;
- Bash command *kinds* (`pnpm test`, `git diff`), never their arguments;
- agent types and their short spawn labels;
- hook-denial classes (`agent-guard:test-writer/allowlist`);
- repo-relative paths (secret-like paths are replaced by `<sensitive>`);
- stage names and step / test / AC counts of a plan.

It never prints message text, prompts, thinking, tool inputs or outputs, hook messages, file
contents or plan notes. A test (`collect.test.mjs`) plants secrets in all of those and checks that
none of them reaches the output.

- **Do not use conversation content.** Agent reports, prompts, diffs, findings or tool output may
  be visible in this conversation. Do not analyse, summarise or quote them. Every claim comes from
  a collector field. The only text facts you may use are agent types and labels, stage names and
  paths, exactly as the collector prints them.
- **For a clean context**, run the retro in a new session with `--session <uuid>`. Pick the id with
  `--list`. Such a run is also cheaper.
- **Enforced** by a `PreToolUse` hook (`agent-guard.mjs workflow-retro`, from this file's
  frontmatter). It applies only during the turn that invoked `/workflow-retro`:
  - **Tools:** only Read, Grep, Glob, Bash, Edit, Write, AskUserQuestion. No subagents, skills,
    web, MCP or artifacts.
  - **Reading:** only `docs/retro/ledger/`, this skill's folder and the collector JSON
    (`<tmp>/workflow-retro*.json`). It cannot read transcripts, code, plans, specs or run reports.
  - **Bash:** only the collector, by absolute path, plus `jq` / `head` / `tail` / `wc` on stdin.
  - **Writing:** only `docs/retro/ledger/<lower-kebab>.md`. Write may only create a missing file;
    Edit may only append at the end. `metrics.jsonl` is written by the collector (`--record`).

  A block is a finding for the report, not something to work around.

## Modes

| Invocation | Window | Use when |
|---|---|---|
| `/workflow-retro` | this session (`${CLAUDE_SESSION_ID}`): everything except the retro's own turns | right after a workflow |
| `--plan NNN` | the `/run-plan NNN` run: its start → its last stage. Adds stage timings and plan product metrics | after `/run-plan` |
| `--session <uuid>` | a past session of this project, analysed from a fresh conversation | cleanest context, cheapest |
| `--list` | prints recent sessions (id, start/end, prompts, agents, retro runs) and stops | to pick `--session` |
| `--since` / `--until <ISO>` | narrows any window | several workflows in one session |
| `--no-baseline` | skips the comparison with earlier runs | — |
| `--no-write` | chat report only: no `runs.md` entry, no `metrics.jsonl` row | a trial run |

The flags combine, e.g. `--session <uuid> --plan 006`.

## Procedure

### 0 — Scope

Parse the arguments.
- `--list`: run the collector with `--list`, show a table of the sessions and stop.
- Otherwise the session is the `--session` value, or `${CLAUDE_SESSION_ID}`.

### 1 — Collect (one command)

```sh
node "$(git rev-parse --show-toplevel)/.claude/skills/workflow-retro/scripts/collect.mjs" \
  --session <uuid> [--plan NNN] [--since <ISO>] [--until <ISO>] [--baseline] [--record] \
  --out <scratchpad>/workflow-retro-<first 8 of uuid>.json
```

- Add `--baseline` unless `--no-baseline` was given, and `--record` unless `--no-write`.
- `<scratchpad>` is your absolute scratchpad path.
- Stdout carries only `summary`, `baseline.runs` and `recorded`. Read the full JSON from the
  `--out` file with Read.
- On `ok: false`, report the error and stop.

### 2 — Metrics

| Metric | Field |
|---|---|
| Wall clock / critical path / agent time / parallelism | `totals.time.wallClockMs`, `criticalPathMs`, `agentTimeMs`, `parallelism` |
| Time split: main thread / agents only / waiting for user / idle | `totals.time.mainActiveMs`, `agentsOnlyMs`, `userWaitMs`, `idleMs` (they sum to the wall clock) |
| Main thread: model vs tools vs foreground agents | `totals.time.mainModelMs`, `mainToolMs`, `mainForegroundAgentMs` |
| Agents (by type, by depth) | `totals.agents`, `byType.*.runs`, `totals.agentsByDepth` |
| Tokens: main / subagents / total, output, thinking | `totals.tokens.*` |
| Cache-read share | `totals.cacheReadShare` |
| Cost ~est. | `totals.costUsd` (list prices from `pricing.json`, which also has its date; name any `unpricedModels`) |
| Tool calls, errors, hook denials | `totals.counts.toolCalls`, `toolErrors`, `denials`, `hotspots.denialsByGuard` |
| Questions, resumes, turn-limit stops, compactions | `totals.counts.*` |

Durations as `1h 05m` / `6m 50s`, tokens as `23.4M`, cost as `~$11.13`.

### 3 — Where the time went

- **The split.** Give the share of each part of the wall clock.
- **Critical path vs agent time.** Parallelism = agent time / critical path.
- **Timeline.** A Mermaid `gantt` from `agents[].first` / `last`, grouped by `waves`. Do it only
  when there are 15 agents or fewer.
- **Serial stretches.** Look for waves with a single agent where the flow allowed more (e.g.
  reviewers after tests), and large `startDelayMs` values.

### 4 — Slow and fast

Judge every agent run and every hotspot with these signals. Cite the field each time.

| Signal | Slow / wasteful when | Field |
|---|---|---|
| Time sink | in the top 3 of `activeMs`, or ≥ 1.5× its baseline median | `hotspots.slowestAgents`, `baseline.byType.*.activeMsPerRun` |
| Model-bound vs tool-bound | model time ≥ 70% → context or prompt size, model choice, task size; tool time ≥ 40% → slow commands | `agents[].modelMs`, `toolMs` |
| Slow commands | one command kind ≥ 10% of agent time, or repeated runs (e.g. a full test suite ×N) | `hotspots.bashKinds`, `hotspots.slowestCalls`, `agents[].bash` |
| Waiting for the user | `ratios.userWaitShare` ≥ 0.2, or single waits > 5 min | `totals.time.userWaitMs`, `hotspots.userWaits` |
| Serial flow | parallelism < 1.3 with independent agents; long `startDelayMs` | `totals.time.parallelism`, `waves`, `agents[].startDelayMs` |
| Context bloat | `peakContext` ≥ 150k, or high `avgContext` with many `requests` | `agents[].peakContext`, `avgContext`, `promptChars` |
| Cache inefficiency | `cacheReadShare` < 0.85, or `cacheWrite` large relative to `cacheRead` | `totals.cacheReadShare`, `agents[].usage` |
| Friction | `denialsPer100ToolCalls` ≥ 3 (each denial ≈ one retry), tool errors, turn-limit stops, resumes, compactions | `ratios`, `hotspots.denialsByGuard`, `turnLimitHits` |
| Duplicate reads | the same file read by ≥ 3 agents → pass it, or a summary of it, in the prompt | `duplicateReads` |

**Fast / keep** — say what to preserve:
- baseline verdict `faster`;
- high `outputTokPerSec`;
- zero denials and errors;
- good parallel waves;
- low cost or time per step.

The baseline needs at least 2 earlier runs (`verdict: no-baseline` otherwise). Runs of different
size differ, so prefer the per-unit ratios (per plan step, per changed file) over raw totals.

### 5 — Product metrics

| Metric | Field |
|---|---|
| Lead time | `plan.leadTimeMs` (with `--plan`), else `totals.time.wallClockMs` |
| Stage durations (implement, checks, reviews, tests, fix-N, report) | `plan.stages[].durationMs` |
| Throughput | `totals.delivery.filesChanged`, `linesAdded` / `linesRemoved`, `plan.steps`, `plan.tests`, `plan.acceptanceCriteria` |
| Unit economics | `ratios.minutesPerPlanStep`, `costPerPlanStep`, `tokensPerPlanStep`, `costPerTest`, `costPerChangedFile`, `outputTokensPer100Lines` |
| Rework | `plan.fixRounds`, `totals.counts.resumes`, `turnLimitHits` |
| Human load | `totals.counts.userPrompts`, `questionsToUser`, `ratios.userWaitShare` |
| Guardrail cost | `ratios.denialsPer100ToolCalls` |

Show `baseline.ratios.*` next to each metric that has one.

### 6 — Scorecard

Rate **good / ok / poor**, each with one field as evidence:
- **speed:** wall clock, critical path, vs baseline;
- **cost:** cost per step or file, cache share;
- **flow:** parallelism, serial waves, idle time;
- **friction:** denials per 100 tool calls, errors, turn-limit stops;
- **user load:** user-wait share, questions.

### 7 — Recommendations

Rank by expected saving (time or ~$), at most 7:

```
P-n · <high|medium|low> · target: <file or component> · effort: S|M|L
Change: <the concrete edit — a hook allowlist entry, a prompt line, a model or effort setting, a run-plan step, a test-run scope>
Why: <metric + field>   Expected: <e.g. "−1m 40s per run: pnpm exec vitest ×21 = 2m 01s → targeted runs">
```

- Prefer small, measurable changes over rewrites.
- Write the change in your own words; never paste conversation content into it.
- Before numbering, Grep `^- P-` in `docs/retro/ledger/runs.md`. If a recommendation with the same
  target and change is already there, mark it `Recurs: ×N`; at ×2 it is **high**.
- If an earlier proposal was applied and the metric did not move, say so.

### 8 — Ledger

Unless `--no-write`:
- `metrics.jsonl` was already appended by `--record`. Report `recorded`: appended, or skipped
  because this window was recorded before.
- Append a `runs.md` entry in **format v2** (`docs/retro/ledger/README.md`) with Edit: `old_string`
  = the last lines of the file, `new_string` = the same lines + the entry.
- If `runs.md` does not exist yet, create it with Write: the line `# Workflow retro — runs`, a
  blank line, then the entry.
- Do not write component files: per-type history now lives in `metrics.jsonl`.
- Ledger text is English: numbers, agent types, command kinds, paths and stage names only.

### 9 — Chat report

In this order, short:
1. scope line (mode, window, session id8, plan);
2. metrics table;
3. where the time went (split + timeline);
4. slowest and fastest (3–5 each, with numbers);
5. product metrics;
6. scorecard;
7. recommendations (highest saving first);
8. ledger rows written;
9. anything `unknown` or `no-baseline`.

End with: "Which recommendations should I apply?" Applying them is a separate task, in a new
message.

## Hard rules

- **Recommendations, not edits.** Never change agents, skills, hooks, settings, `AGENTS.md` or
  `CLAUDE.md` during a retro. The hook blocks it anyway.
- **Measured vs estimated.** Durations and tokens are measured. Cost is `~est.` (list prices,
  not the subscription bill). Missing data is `unknown`, never guessed.
- **Evidence is a collector field** (`hotspots.bashKinds[0]`, `agents[3].peakContext`), not a quote.
- **Blameless and specific.** The fix goes to the setup (prompt, tools, hook, plan, orchestration),
  not to "the agent should try harder".
- **Ledger is append-only and duplicate-free.** Never edit or delete an existing line.
- **Read-only on the run.** No git writes, no re-running agents, no fixing the product code.
- Talk to the user in the language of the request.
