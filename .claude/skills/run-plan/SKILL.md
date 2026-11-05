---
name: run-plan
description: "Executes an approved Development Plan (docs/plans/NNN-<slug>.md from implementation-planner, built from an approved spec-creator spec) end to end in the main thread: preflight gates and a baseline snapshot, implementer for the production code, deterministic typecheck + dependency-cruiser, then test-writer (tests from the spec's acceptance criteria) in parallel with architecture-reviewer and, when triggered, security-reviewer, one merged fix loop (max 2 rounds), and a Run Report with the hand-off for a manual plan-verifier run. Accepts a plan path (default: the plan implementation-planner just returned), design screenshots and clarifications. Use only when the user types /run-plan or explicitly asks to run / execute / implement an approved plan. Does not run plan-verifier, pr-self-review or commit."
argument-hint: "[docs/plans/NNN-slug.md] [--design <img>…] [--note \"…\"] [--security auto|on|off] [--mode single-agent|multi-agent] [--yes]"
disable-model-invocation: true
metadata:
  version: "1.0.0"
  tags: "orchestration, implementer, test-writer, architecture-review, security-review, plans"
---

# Run Plan

Runs one approved plan through the agents, in the **main thread** (only the main thread can start
agents, resume them with `SendMessage` and ask the user). The chain around it:

```
spec-creator → approved spec (AC-n EARS) → implementation-planner → plan (Steps + Tests T-n)
  → /run-plan:  0 input → 1 preflight → 2 implementer → 3 checks
                → 4 test-writer ∥ architecture-reviewer ∥ security-reviewer(if triggered)
                → 5 merged fix loop (≤ 2 rounds) → 6 Run Report → 7 hand-off
  → plan-verifier (manual, by the user) → doc-writer (optional) → pr-self-review → commit
```

The deterministic part lives in `scripts/run-plan.mjs` (below: `rp`). Every call prints JSON;
exit 1 means a gate failed and the JSON says why.

```bash
node "$(git rev-parse --show-toplevel)/.claude/skills/run-plan/scripts/run-plan.mjs" <command> …
```

(Write the full command in each Bash call — shell functions don't persist between calls.)

## Hard rules

- **You orchestrate; agents change code.** Never Edit/Write production code or tests yourself
  during a run — the agents' guard and Stop hooks, the review scope and the Run Report all assume
  every change came from an agent. The only files you write: the plan header's `Execution mode:`
  line, a newly saved plan, and the Run Report.
- **Never answer an agent's question yourself.** `BLOCKED`, `NEEDS_CLARIFICATION`, a test
  dispute or a scope question goes to the user (`AskUserQuestion`); resume the agent with
  `SendMessage` and the user's answer.
- **Never lower a severity or drop a finding.** CRITICAL and WARNING go into the fix batch;
  SUGGESTION goes into the report only. A finding you think is wrong is still listed — with your
  note — and the user decides.
- **The plan is the scope.** A clarification that needs a file, module, contract or migration the
  plan does not list is a scope change: stop and offer the chain — spec revision (spec-creator) →
  new plan revision (implementation-planner). Don't hand it to the implementer as an addendum.
- **plan-verifier is not part of this skill.** Don't start it; print the hand-off (step 7).
- **Keep your context lean.** Don't read diffs or source files to second-guess agents — work from
  their reports and the script's JSON. Read a file only to resolve a contradiction between reports.
- **No git writes**, no `pr-self-review`, no commit — those come after the manual verification.
- Talk to the user in the language of the request; agent prompts in English; paths as-is.
- Load `SendMessage` with ToolSearch (`select:SendMessage`) before the first resume. Keep the
  agent id every `Agent` call returns: one per implementer workstream, test-writer workstream and
  reviewer.
- **A resume is asynchronous.** `SendMessage` to a finished agent restarts it in the background and
  returns at once (`"Resuming agent …"`); its report arrives later as a task notification. Wait for
  that notification before the next step — never treat the send result as the agent's answer, and
  never start a step that depends on it in the same turn. Several resumes to different agents may
  run at once (e.g. re-reviews), the same rules as parallel `Agent` calls apply.

## Arguments and non-interactive runs

| Argument | Meaning |
|---|---|
| `docs/plans/NNN-slug.md` | the plan; default — see step 0 |
| `--design <path>` (repeatable) | local screenshots / mockups for the UI steps and UI tests (Figma → exported images) |
| `--note "…"` (repeatable) | a clarification; in-scope → Addendum, scope change → stop (rule above) |
| `--security auto\|on\|off` | security-reviewer: by triggers (default), always, never |
| `--mode single-agent\|multi-agent` | answers the mode question if the plan header still says `AWAITING USER CHOICE` |
| `--yes` | accept the **recommended** option at every gate that has one, instead of asking |

`--yes` never resolves `BLOCKED`, a test dispute, an open CRITICAL after round 2, or a scope
change — those always stop the run with a report. When `AskUserQuestion` is not available
(headless `claude -p`), behave as if `--yes` was given and stop at those points.

## Procedure

Record every finished stage: `rp stage <NNN> <name> <ok|blocked|skipped|failed> --note "<one line>"`
(names: `implement`, `checks`, `tests`, `review-architecture`, `review-security`, `fix-1`,
`fix-2`, `report`). After a context compaction, `rp status <NNN>` tells you where you are.

### 0 — Input

1. **Plan.**
   - A path argument → use it.
   - No path, and implementation-planner returned a `Status: READY` plan earlier in this
     conversation that is not saved → save it as `docs/plans/README.md` says: ask the mode
     (`AskUserQuestion`, recommended option first, unless `--mode`), translate to English with the
     same structure, take the next free `NNN` in `docs/plans/`, set the `Execution mode:` line,
     Write the file.
   - Otherwise → `ls docs/plans/` and ask which plan (up to 4 newest with `Status: READY`).
   - A planner result with `NEEDS_SPEC` / `NEEDS_CLARIFICATION` is not a plan — say so and stop.
2. **Design images.** Check each path exists (`ls`). A URL → ask for an exported screenshot. They
   go to the implementer steps and test-writer rows that touch `client/`.
3. **Notes.** Sort each into *Addendum* (inside the plan: wording, a default, a detail) or *scope
   change*. Show the sorting to the user in one line each; scope change → stop (Hard rules).

### 1 — Preflight

Run `rp start <plan>`.
- `ok: false` with `errors` → show them and stop. Typical: plan not `READY`; spec not `approved`
  or without `AC-n`; plan without `## Tests (test-writer)` or with test files in Steps (predates
  this contract — re-run implementation-planner); multi-agent without workstream rows.
- `resumable: true` → ask: resume from the last stage (`rp status`) / restart (`start --force`) /
  stop. With `--yes`: resume. **Resuming in a new session:** agent ids of the old session are gone.
  Read the agents' reports saved so far from `reportPath` (step 6 appends them as they arrive), skip
  the stages already `ok`, and when a later stage needs an agent that already ran (a fix batch for
  the implementer, an `it.fails` flip for test-writer), start a fresh one: plan path + "Steps
  S… are already implemented (files: <`rp changed`>); do not redo them — work only on this
  <fix batch | flip>".
- A warning "Execution mode … ask the user" → ask (or `--mode`), Edit only that header line of
  the plan, then `rp start <plan> --force`.
- A warning "node_modules missing" → tell the user; offer to install before the run (the agents
  cannot: lockfile and install rules), or continue with those checks `NOT RUN`.
- A warning "already dirty before the run" → tell the user which plan files carry pre-run edits
  (reviewers and plan-verifier will see them); continue unless they object.
Note `reportPath`, the test ids, the workstreams and `affected` from the JSON.

### 2 — Implement

**single-agent** — one `Agent(subagent_type: "implementer")`:

```
Implement the plan <plan path> (spec: <spec path>). Execute all Steps in order.
Addenda (in scope, from the user): <numbered list | none>
Design images: <paths + which steps | none>
Do not create test files — test-writer writes the Tests table after you. Edit existing tests only
for the plan's "Existing tests affected" rows marked compile; leave `assertion` rows red and report
them as expected red. Return your Implementation Report.
```

**multi-agent** — the plan's workstream rows with agent `implementer`, in dependency order: the
foundation first, then every workstream whose dependencies are done **in one message** (parallel
`Agent` calls) — only if they are in different packages; same package → one after another. Same
prompt plus `Workstream <Wn>: <steps>` and "other workstreams run before/after you; touch only your
steps' files". Test-writer workstreams run in step 4.

On the report:
- `DONE` → `rp stage <NNN> implement ok`, go on.
- `PARTIAL` where **every step is done** and the only gaps are checks marked `NOT RUN` for an
  environment reason (deps not installed, no Docker / stack) → continue; record
  `implement ok --note "<the NOT RUN checks>"` and carry them into Open items.
- `PARTIAL` with an unfinished step, or `BLOCKED` → show Blockers to the user; options: answer and resume the same agent
  (`SendMessage`) / re-plan (implementation-planner, new revision) / stop. Never fix it yourself.
  Disputed scope (a missing file, contract or migration) is a re-plan.

### 3 — Deterministic checks

Run `rp checks <NNN>` (typecheck of the touched packages + new dependency-cruiser violations,
the same code pr-self-review uses). `NOT RUN` notes (deps missing) → tell the user.
- CRITICAL findings → one `SendMessage` to the implementer that owns the package: "Fix batch
  (deterministic checks): <findings with file:line>" → `rp checks` again. Still CRITICAL → stop
  and show them (no reviewer runs on code that does not typecheck).
- Expected-red tests (the plan's `assertion` rows) are not a checks failure — checks do not run tests.

### 4 — Tests ∥ reviews

Run `rp reviewers <NNN> --security <flag>` and `rp changed <NNN>`. Then start **in one message**:

- **test-writer** — single-agent: one; multi-agent: one per test-writer workstream (parallel only
  across packages):

  ```
  Write the tests of plan <plan path>, section "Tests (test-writer)": <all T rows | T-a…T-b>, plus
  the `assertion` rows of "Existing tests affected". The oracle is the spec <spec path> — its AC /
  EC / NFR / Untrusted inputs — not the implementation. Implementation Report (seams, deviations):
  <Steps + Deviations sections of the report, verbatim>. Design images: <paths | none>.
  A test that fails because the code contradicts an AC → it.fails + // BUG(test-writer) + "Bugs found".
  Return your Test Report.
  ```

- **architecture-reviewer** when `architecture.run`:

  ```
  Review the architecture of the change made for plan <plan path>. Scope — only these files
  (others in the working tree were dirty before the run and are not part of it): <files from
  `rp changed` — production code; tests come later from test-writer and are reviewed by
  pr-self-review>. Use `git diff HEAD -- <file>` for tracked files and read
  untracked ones whole. Test files are being written in parallel and are not in scope. Plan's notes for you: <plan "Handoff to reviewers → Architecture" +
  implementer "Handoff to reviewers">. Return your Architecture Review.
  ```

- **security-reviewer** when `security.run` — same scope and diff instructions; add the reasons
  from `rp reviewers` and the plan's Security line; "Return your Security Review."

Record `tests`, `review-architecture`, `review-security` (`skipped` with the reason when not run).

### 5 — Merged fix loop (max 2 rounds)

Build the **fix batch** from the three reports:
- test-writer "Bugs found" (each: `T-n`, `AC-n`, prod `path:line`, the `it.fails` test and its
  run command);
- architecture-reviewer findings with severity CRITICAL or WARNING (verdict `BLOCKED` / `CONCERNS`);
- security-reviewer findings CRITICAL or WARNING (verdict `request_changes` / `comment`).

Test-writer "Not covered" questions and all SUGGESTIONs go to the report, not to the batch. A
test-writer `BLOCKED` (Step 0 questions) → ask the user, resume test-writer with the answers.

Empty batch → step 6. Otherwise, round `k` (1, then 2):
1. `rp checkpoint <NNN> round-<k>`.
2. `SendMessage` to the implementer (multi-agent: the one owning each finding's package; split
   the batch): `Fix batch round <k>:` + numbered `F-n` items (source · id · `path:line` · rule ·
   proposed fix · failing test + command) + "Fix in production code; never edit test-writer's
   tests; report the Fix batch table".
3. Implementer `disputed` (Test dispute) → `SendMessage` the dispute to test-writer: it either
   corrects its test toward the spec or keeps it with the AC it relies on. Still disputed → ask
   the user which reading of the AC holds (this is a spec question).
4. `SendMessage` to test-writer: "Implementer fixed <T-n list>: turn their it.fails into it, run
   every file you wrote twice, report." A test still failing goes into the next round.
5. `rp checks <NNN> --since round-<k>`; CRITICAL → into the next round.
6. Re-review — only the reviewers that reported CRITICAL/WARNING, by `SendMessage` to the same
   agent: "The implementer fixed <F-n list>. Files changed since your review: <`rp changed <NNN>
   --since round-<k>`>. Confirm each finding is fixed and report only new problems in those
   changed lines."
7. `rp stage <NNN> fix-<k> ok|failed`.

After round 2 with anything CRITICAL still open, or a WARNING the implementer could not fix →
stop the loop and ask: accept as open items (they go into the report and to plan-verifier) / one
more round / stop. With `--yes`: open WARNINGs are accepted into the report; an open CRITICAL
stops the run.

### 6 — Run Report

**Save as you go:** append every agent report to `reportPath` the moment it arrives (under the
matching heading below, with `Status: IN PROGRESS` in the header), so a resumed run (step 1) has
them. At this step, complete the file: set the Result, fill the tables. `reportPath` comes from
`rp start` and lives in the git dir, so it is never part of the diff:

```md
# Run Report: <plan path>
Spec: <path> · Mode: <mode> · Baseline: <sha> · Result: DONE | DONE_WITH_OPEN_ITEMS | BLOCKED

## Inputs
- Addenda: <numbered | none> · Design images: <paths | none>

## Stages
| Stage | Agent / script | Status | Note |
|---|---|---|---|

## Implementation Report(s)
<verbatim>

## Test Report(s)
<verbatim>

## Reviews
<architecture and security reports verbatim, plus each re-review>

## Fix rounds
| Round | F-n | Source · id | Fix (`path:line`) | Result |
|---|---|---|---|---|

## Open items
- <open WARNING / accepted CRITICAL / Not covered question / SUGGESTION>   (or "none")

## Insight candidates
- <from the agents' reports>   (or "none")
```

Then `rp stage <NNN> report ok`.

### 7 — Hand-off (final message)

1. Run `/engineering-insights` with the agents' Insight candidates (session protocol: this run
   changed package files). "Nothing new" is a fine result.
2. `rp handoff <NNN>` → print its `prompt` in a code block and tell the user to run
   **plan-verifier** with it manually.
3. The final message: Result, a stage table (agent · status · one line), counts (files changed,
   tests written / `it.fails` left, findings fixed / open), open items, the report path, and the
   next steps: plan-verifier (manual) → `doc-writer` (optional) → `pr-self-review` → commit.

## Failure modes this skill is built around

| Situation | Handling |
|---|---|
| The working tree was dirty before the run | baseline snapshot; reviewers and the hand-off get only files whose content changed during the run |
| Two agents in one package at once | never: both Stop hooks typecheck the whole package |
| Implementer writes tests "to be sure" | `implementer-guard.mjs` blocks `Write` / `cp` / `mv` onto test paths |
| A planned signature change breaks existing tests' compile | plan row `compile` → implementer's Edit; `assertion` → test-writer |
| Implementer and test-writer disagree | the spec's AC decides; if it is ambiguous, the user does |
| Fix loop that never converges | 2 rounds, then the user decides |
| Context compaction mid-run | `rp status <NNN>` + the stage log; agent ids are in the transcript |
| A plan written before this contract | `rp start` refuses it; re-run implementation-planner |
