# Workflow retro ledger

Append-only record of `/workflow-retro` runs: how multi-agent workflows went and what should change
in the agents, skills, hooks and orchestration. Written by the
[`workflow-retro`](../../../.claude/skills/workflow-retro/SKILL.md) skill; read it before tuning an
agent or a skill.

Rules (the same as `INSIGHTS.md`):
- **Append-only.** Never edit, reorder or delete a line. A correction or a status change is a new
  dated entry.
- **No duplicates.** A repeated observation becomes a `Recurs:` entry that points to the first one.
- **English**, evidence for every claim, no secrets.

## Files

| File | Holds |
|---|---|
| `runs.md` | one entry per retro: scope, metrics, scorecard, proposals |
| `<component>.md` | observations about one component, across runs |

Components: one file per agent (`implementer.md`, `test-writer.md`, `implementation-planner.md`,
`spec-creator.md`, `architecture-reviewer.md`, `security-reviewer.md`, `plan-verifier.md`,
`doc-writer.md`, `researcher.md`, …), per skill (`run-plan.md`, `pr-self-review.md`,
`engineering-insights.md`, …), plus `hooks.md` (guards, allowlists, Stop hooks) and
`orchestration.md` (the main thread: prompts, hand-offs, waves, user questions).
Create a file on first use with the header below.

## Formats

`runs.md` entry:

```md
## YYYY-MM-DD — <workflow> · <spec / plan id>
**Scope:** <one line, window> · **Mode:** in-context | deep
| Agents | Tokens (sub / main / total) | Wall clock | Parallelism | Fix rounds | Denials | Questions |
|---|---|---|---|---|---|---|
| 12 (planner 1, implementer 3, …) | 30.4M / 16.0M / 46.4M | 3h 20m | 1.37 | 1 | 21 | 5 |
**Scorecard:** cost ok · flow ok · first-pass good · hand-offs ok · guardrails poor · user load ok
**Proposals:**
- P-1 · high · target: `.claude/hooks/agent-guard.mjs` · <change> · status: proposed
**Components written:** `test-writer.md`, `hooks.md`
```

Component file header and entry:

```md
# <component> — retro observations

### YYYY-MM-DD — <specific title>
**Run:** <runs.md heading> · **Observation:** <what happened> · **Evidence:** <collector field, report
quote, path:line> · **Proposal:** P-n (<runs.md date>) · **Kind:** struggled | easy | duplicated | missed
```

Repeat and status entries:

```md
### YYYY-MM-DD — Recurs: "<original title>" (×N)
**Run:** … · **Evidence:** … · **Note:** <what differs this time>

### YYYY-MM-DD — Status: P-n (<runs.md date>) accepted | rejected | applied | did not help
**Evidence:** <commit, file, or the run that showed it>
```

## Format v2 (workflow-retro 2.0, from 2026-11-06)

The retro became a **performance** retrospective built on metadata only (collector schema 2; see
the skill's "Privacy model"). The formats above are **v1**. Their entries stay as history, but v2
retros write only these two files:

| File | Written by | Holds |
|---|---|---|
| `runs.md` | the retro (Edit, append at the end) | one v2 entry per retro |
| `metrics.jsonl` | `collect.mjs --record` (one line per session + window, never rewritten) | the run's `summary`: totals, ratios, per-agent-type numbers; the baseline for later retros |

Component files (`<component>.md`) get no new entries from v2: per-type history is in `metrics.jsonl`.
Status entries for earlier proposals (`### … — Status: P-n …`) go to `runs.md`.

`runs.md` v2 entry. Numbers, agent types, command kinds, paths and stage names only — no quotes:

```md
## YYYY-MM-DD — <workflow> · <plan NNN | session id8>
**Scope:** <window, UTC> · **Mode:** session | plan NNN | session <id8> · **Schema:** 2
| Wall clock | Critical path / agent time | Parallelism | Split main / agents / user / idle | Agents | Tokens | Cost ~est. | Denials |
|---|---|---|---|---|---|---|---|
| 18m 21s | 15m 51s / 30m 23s | 1.92 | 80% / 20% / 0% / 0% | 9 | 23.4M (cache 94%) | ~$11.13 | 18 |

**Product:** lead time 18m 21s · 13 steps · 51 tests · 92 files · 1.4 min/step · ~$0.86/step · fix rounds 1
**Slowest:** 1) test-writer `W6` 6m 50s (tool 33%: `pnpm exec vitest` …) 2) … 3) …
**Fastest / keep:** …
**vs baseline (n=K):** wall clock 0.8× faster · cost/step 1.3× typical · …
**Scorecard:** speed ok · cost ok · flow good · friction poor · user load good
**Recommendations:**
- P-1 · high · target: `<file>` · effort S · expected −1m 40s/run · <change> · status: proposed
```
