# Agents

Project subagents for Claude Code. Each `*.md` here is one agent: YAML frontmatter (model, tools,
skills, hooks) + its system prompt. This README is the map of the set. The rules themselves live
in the agent files; when you change an agent, update its row here.

## Flow

```
goal ──► brainstorm (optional: several reasonable approaches) ──► user picks an option
  │
  └──► planner ──► Development Plan ──► user approves ──► main thread saves docs/plans/NNN-<slug>.md
                                                                           │
             implementer(plan path) ◄──────────────────────────────────────┘
                     │
                     ▼
             Implementation Report ──► test-writer ──► Test Report
                                            │
                                            ▼
                                   plan-verifier(plan path) ──► traceability matrix
                                            │
                                            ▼
                     architecture-reviewer ∥ security-reviewer ──► findings
                                            │
                                            ▼
                                   doc-writer ──► docs as built
                                            │
                                            ▼
                     main thread: pr-self-review → commit · /engineering-insights

researcher — on demand at any point: one concrete question → research report
```

The main thread orchestrates. Agents do not call each other (`Agent` is disallowed in all of
them) and cannot ask the user questions; they return clarifying questions in their final message.

## At a glance

| Agent | Responsibility | Model | Tools | Writes files | Skills (preloaded) | Hooks | Max turns |
|---|---|---|---|---|---|---|---|
| [researcher](researcher.md) | Answer one concrete question from the repo or external sources | `sonnet` | Read, Grep, Glob, Bash (read-only by prompt), WebSearch, WebFetch | no | — | — | — |
| [planner](planner.md) | Turn a goal into a structured Development Plan | `opus`, effort `high` | Read, Grep, Glob | no | project set (10) | — | 40 |
| [implementer](implementer.md) | Execute an approved plan in server / client / reviewer-core / e2e flows | `sonnet` | Read, Grep, Glob, Edit, Write, Bash | yes, guarded | project set (10) | guard + verify | 150 |
| [brainstorm](brainstorm.md) | Compare options for one decision before planning | `opus`, effort `high` | Read, Grep, Glob, WebSearch, WebFetch | no | onion, frontend-architecture | — | 30 |
| [test-writer](test-writer.md) | Write and run UI / backend / e2e tests for existing code | `sonnet` | Read, Grep, Glob, Edit, Write, Bash | test files only | testing set (4) | guard `test-writer` + verify | 100 |
| [plan-verifier](plan-verifier.md) | Check the code against every item of a plan | `opus`, effort `high` | Read, Grep, Glob, Bash (allowlist) | no | — (on purpose) | guard `verifier` | 60 |
| [architecture-reviewer](architecture-reviewer.md) | Check architectural boundaries of a change | `opus`, effort `high` | Read, Grep, Glob, Bash (allowlist) | no | architecture set (3) | guard `readonly` | 40 |
| [security-reviewer](security-reviewer.md) | Find exploitable vulnerabilities and rate them | `opus`, effort `high` | Read, Grep, Glob, Bash (allowlist) | no | security | guard `readonly` | 40 |
| [doc-writer](doc-writer.md) | Document implemented features with diagrams in the right docs section | `sonnet` | Read, Grep, Glob, Edit, Write | docs / READMEs only | mermaid-diagram | guard `doc-writer` | 60 |

`permissionMode` is not set on any agent: it inherits the session's mode, and a parent in
`auto`, `acceptEdits`, `bypassPermissions` or `plan` overrides it anyway. Read-only is enforced
by the tool list, not by a mode.

## researcher

- **Does:** repository research (`path:line` evidence) and external research (fetched sources,
  version-matched), or both in one report.
- **Does not:** modify anything, run skills or sub-agents, guess.
- **Disallowed:** Write, Edit, NotebookEdit, Skill, Agent.
- **In:** a concrete question with scope. **Out:** `# Research: …` report (Type A repository /
  Type B external) with Answer, Findings, References, "Not found / unverified" — or a
  `## Clarification needed` block.

## planner

- **Does:** reads package `AGENTS.md`, `INSIGHTS.md` (top 3 per package) and `specs/`; places the
  change in onion rings / frontend layers; builds a per-file **skill contract** from the
  preloaded skills; plans cross-cutting work (both `vendor/shared` copies, `db:generate`,
  reviewer-core → server typecheck, e2e flows); gives every step "Done when" + "Verify".
- **Does not:** write code or files, use `pr-self-review/routing.json` as a planning source.
- **Disallowed:** Edit, Write, NotebookEdit, Bash, Agent, Skill, WebFetch, WebSearch.
- **In:** a goal (the delegation prompt). **Out:** a Development Plan in Markdown —
  `Status: READY` (Goal & non-goals · Context consulted · Architecture · Skill contract · Steps ·
  Cross-cutting · Tests · Verification · Handoff to reviewers · Risks) or
  `Status: NEEDS_CLARIFICATION` with 3–5 questions. ~2k tokens. Persisted by the main thread to
  [`docs/plans/`](../../docs/plans/README.md).

## implementer

- **Does:** executes plan steps in order; follows the contracted skills; runs typecheck + unit
  tests of touched packages (integration / e2e only if the plan asks and Docker / stack is up);
  checks the diff stays within the plan; reports evidence.
- **Does not:** plan, commit or push, architecture / security review, dependency-cruiser, fix
  pre-existing issues, weaken tests, edit `INSIGHTS.md`. Stops with `BLOCKED` on contradictions,
  out-of-plan modules / contracts / migrations, or two failed fixes of the same check.
- **Disallowed:** Agent, Skill, NotebookEdit, WebFetch, WebSearch.
- **In:** path to a plan with `Status: READY`. **Out:** source changes in the working tree +
  an Implementation Report — `Status: DONE | PARTIAL | BLOCKED` (INSIGHTS applied · Steps ·
  Deviations · Verification evidence table · Blockers · Handoff to reviewers · Insight
  candidates). ~1.5k tokens.

## brainstorm

- **Does:** frames one decision; 2–4 genuinely different options incl. the baseline; decision
  drivers with sources; one-way / two-way door; Pugh matrix against the baseline; recommendation
  with a "Confirmation" that plan-verifier or tests can check later. External facts are fetched
  and version-matched.
- **Does not:** plan steps, write code or files, run commands.
- **Disallowed:** Edit, Write, NotebookEdit, Bash, Agent, Skill.
- **In:** a decision question (or a goal with competing approaches). **Out:** `# Options: …` —
  `Status: READY` (Context · Decision drivers · Options · Comparison · Recommendation ·
  Assumptions · References) or `Status: NEEDS_CLARIFICATION`. ~1.5k tokens.

## test-writer

- **Does:** writes tests by the package conventions (server `*.test.ts` / `*.it.test.ts` with
  `buildApp({ overrides })` + `mocks.ts`; client colocated RTL tests with `vi.mock`; reviewer-core
  `test/<basename>.test.ts`; e2e `NN-*.flow.json`); uses `docs/skills/{edge-case-checklist,
  over-mocking,flaky-test-patterns,uncovered-branches}` as a rubric; runs every test twice; names
  the production line each test guards (mutation check).
- **Does not:** change production code, configs or dependencies; weaken or snapshot-update tests.
  A real bug becomes an `it.fails` reproduction with `// BUG(test-writer)` plus a report entry.
- **Disallowed:** Agent, Skill, NotebookEdit, WebFetch, WebSearch.
- **In:** a plan (its Tests table), a report, files / a module, or a bug. **Out:** test files +
  `# Test Report: …` — `Status: DONE | PARTIAL | BLOCKED` (INSIGHTS applied · Tests written ·
  Verification · Bugs found · Not covered · Insight candidates). ~1.5k tokens.

## plan-verifier

- **Does:** turns the plan into a checklist (goal, non-goals, each step's Change / Done when /
  Verify, Skill-contract rows, cross-cutting, Tests rows, Verification commands, cited spec
  acceptance criteria) and gives each item `MET | PARTIAL | NOT_MET | NOT_VERIFIABLE` with
  `path:line` and command evidence; lists out-of-plan files and report claims that don't hold.
- **Does not:** validate the plan, give advice, review style / architecture / security; mark an
  item `MET` without evidence. Preloads no skills on purpose — it checks the rules the plan copied.
- **Disallowed:** Edit, Write, NotebookEdit, Agent, Skill, WebFetch, WebSearch.
- **In:** plan path (+ optional Implementation Report, base ref). **Out:** `# Plan Verification: …`
  — `Verdict: VERIFIED | GAPS | BLOCKED` with the traceability matrix. ~2k tokens.

## architecture-reviewer

- **Does:** maps changed files to onion rings / frontend layers and checks each new import, call
  and symbol against the review checklists of `onion-architecture`, `frontend-architecture` and
  `next-best-practices`, plus both `vendor/shared` copies; finds new usages on known legacy edges
  that the depcruise baseline cannot see.
- **Does not:** run dependency-cruiser or `tsc` (pr-self-review does), report pre-existing
  violations the change does not extend, review style / performance / security.
- **Disallowed:** Edit, Write, NotebookEdit, Agent, Skill, WebFetch, WebSearch.
- **In:** default `HEAD` → working tree, or a range / files / plan. **Out:** `# Architecture
  Review: …` — `Verdict: PASS | CONCERNS | BLOCKED`, findings with rule, `NEW | KNOWN-EXTENDED`,
  `path:line`, impact, fix (pr-self-review severity scale). ~1.5k tokens.

## security-reviewer

- **Does:** maps sources and sinks of the change against the repo's threat model (malicious repo
  / PR author first), traces source → sink with `path:line`, runs a sceptical filter pass, reports
  only findings with a concrete exploit and confidence ≥ 0.8, classified by CWE and OWASP Top
  10:2025 / LLM Top 10 2025.
- **Does not:** fix code, run exploits, report DoS / rate limiting / generic validation /
  no-login mode itself, review style or architecture.
- **Disallowed:** Edit, Write, NotebookEdit, Agent, Skill, WebFetch, WebSearch.
- **In:** default `HEAD` → working tree, or a range / files / plan. **Out:** `# Security Review: …`
  — `Verdict: request_changes | comment | approve`; severity `CRITICAL | WARNING | SUGGESTION`
  (the repo scale) + `security_severity` 0.1–10 in the GitHub / CVSS bands. ~1.5k tokens.

## doc-writer

- **Does:** documents a feature *as built* (claims traced to code; plan-vs-code differences go
  to the report); picks the page type (Diátaxis) and the place: `<package>/docs/` + index line,
  package README sections, `server/src/modules/<m>/README.md`, root README architecture; ADRs as
  `<package>/docs/adr-NNN-<slug>.md`; Mermaid flowchart / sequence / ER / state (no C4 syntax).
- **Does not:** write code, plans, specs, `INSIGHTS.md`, `AGENTS.md`, `TESTING.md`, root `docs/`.
- **Disallowed:** Bash, NotebookEdit, Agent, Skill, WebFetch, WebSearch.
- **In:** feature / plan / report / notes. **Out:** docs + `# Docs Report: …` (Pages · Index &
  links · Sources · Plan vs code discrepancies · Open questions). ~1k tokens.

## Hooks

| Hook | Used by | Event | Blocks | Fails |
|---|---|---|---|---|
| [`implementer-guard.mjs`](../hooks/implementer-guard.mjs) | implementer | `PreToolUse` on Edit / Write / Bash | writes to `server/clones/`, lockfiles, `server/src/db/migrations/`, `.git/`, `.githooks/`, `.claude/`, `INSIGHTS.md`, `.env*`, root strays, outside the repo; git write commands, `gh pr/api`, `--no-verify`, `PR_SELF_REVIEW_SKIP`, shell writes to those paths | closed (bad input → block) |
| [`implementer-verify.mjs`](../hooks/implementer-verify.mjs) | implementer | `Stop` → `SubagentStop` | stopping while `tsc --noEmit` (src + test via `tsconfig.test.json` where present) fails in a package the agent edited (+ server after reviewer-core) | open: max 2 blocks per run, then a user warning; missing deps → warning |
| [`agent-guard.mjs <profile>`](../hooks/agent-guard.mjs) | test-writer, doc-writer, plan-verifier (`verifier`), architecture- / security-reviewer (`readonly`) | `PreToolUse` on Edit / Write / Bash | Edit / Write outside the profile's path allowlist (test files · docs/READMEs · nothing); Bash outside the allowlist (read-only git / `ls` / `rg` …; + `pnpm\|npm test/typecheck`, `vitest run`, `tsc --noEmit` for `test-writer` / `verifier`), shell writes, `$(…)`, process substitution, env-var prefixes, `find -exec/-delete`, `git --output`, snapshot updates | closed (unknown profile / bad input → block) |
| [`test-writer-verify.mjs`](../hooks/test-writer-verify.mjs) | test-writer | `Stop` → `SubagentStop` | stopping while the unit / component test files it wrote fail (+ typecheck of each package with a changed test — client `tsc --noEmit`, server / reviewer-core `tsconfig.test.json`); `*.it.test.ts` and e2e flows are not run | open: max 2 blocks per run, then a user warning; missing deps → warning |

Guard tests: `node --test .claude/hooks/agent-guard.test.mjs`.

Hooks of project agents run only in a **trusted** folder (the trust dialog on first launch).
Without trust the agent still runs, without its guards.

## Skills

planner and implementer preload the **same** set, so the plan and the code follow the same
rules. Full skill content is injected into the agent's context (~24k tokens per run).

| Group | Skills |
|---|---|
| UI | `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library` |
| Backend | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` |
| Shared | `zod`, `mermaid-diagram` |
| Excluded | `security`, `pr-self-review` (later review stages), `engineering-insights` (main thread), `typescript-expert` |

A new project skill is not picked up automatically — add it to both agents' `skills:` and to
this table.

The other agents preload only the skills of their job:

| Agent | Skills | Why not more |
|---|---|---|
| brainstorm | `onion-architecture`, `frontend-architecture` | options are placed in rings / layers; implementation detail is the planner's |
| test-writer | `react-testing-library`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod` | the product test rubric (`docs/skills/*`) is not a Claude skill — it is read with Read |
| plan-verifier | — | it checks the rules the plan copied into its Skill contract; a preloaded skill set invites general advice |
| architecture-reviewer | `onion-architecture`, `frontend-architecture`, `next-best-practices` | RSC boundaries are architecture; React / data-access detail is not |
| security-reviewer | `security` | the skill's generic stack examples (Express, Mongo, JWT) are overridden by the prompt's threat model |
| doc-writer | `mermaid-diagram` | — |

## Artifacts

| Artifact | Produced by | Consumed by | Where |
|---|---|---|---|
| Research report | researcher | main thread / user | final message |
| Development Plan | planner | user (approval), implementer | final message (language of the request) → `docs/plans/NNN-<slug>.md` (always English, translated by the main thread) |
| Implementation Report | implementer | main thread, reviewers | final message |
| Code changes | implementer | reviewers, `pr-self-review` | working tree (uncommitted) |
| Insight candidates | implementer, test-writer | main thread → `/engineering-insights` | report section |
| Options comparison | brainstorm | user (choice), planner | final message (optionally an ADR via doc-writer) |
| Tests + Test Report | test-writer | plan-verifier, reviewers, `pr-self-review` | test files (uncommitted) + final message |
| Plan Verification | plan-verifier | main thread / implementer (gaps) | final message |
| Architecture / Security Review | architecture-reviewer, security-reviewer | main thread / implementer (fixes) | final message |
| Docs + Docs Report | doc-writer | readers, `pr-self-review` | `<package>/docs/`, READMEs (uncommitted) + final message |

## Sources behind planner and implementer

Official Anthropic sources (fetched 2026-10-27). **SA** = [Subagents](https://code.claude.com/docs/en/sub-agents) ·
**BP** = [Best practices](https://code.claude.com/docs/en/best-practices) ·
**PM** = [Permission modes](https://code.claude.com/docs/en/permission-modes) ·
**HK** = [Hooks reference](https://code.claude.com/docs/en/hooks) ·
**MARS** = [Multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) ·
**CE** = [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) ·
**BEA** = [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

| Rule | Source | Applied in |
|---|---|---|
| Omitted `tools` inherits every tool — set it explicitly | SA · Supported frontmatter fields | both: explicit `tools` |
| Limit tool access; the limit is enforced by Claude Code, not the prompt | SA · Best practices; BP | planner: Read/Grep/Glob only; implementer: no web |
| Parent permission mode overrides the subagent's `permissionMode` | SA · Permission modes | no `permissionMode`; read-only via tools |
| Plan mode still allows shell commands | PM | planner has no Bash |
| Subagents can spawn subagents; remove `Agent` to prevent it | SA · Spawning subagents | both: `Agent` disallowed; reviews are separate agents |
| `skills:` injects full skill content; `Skill` tool controls on-demand loading | SA · frontmatter `skills` | both: same preloaded set, `Skill` disallowed |
| Description singles out one agent; "use proactively"; details in the prompt | SA · Description and proactive delegation | both `description` fields |
| Fresh context — restate the rules the agent must follow | SA | repo invariants restated in both prompts |
| One focused task per subagent | SA · Best practices | planner doesn't implement; implementer doesn't review |
| Objective, output format, tool guidance, clear boundaries | MARS · Prompt engineering | prompt sections: Inputs · Hard rules · Procedure · Output |
| Store work in artifacts, pass lightweight references | MARS | plan file in `docs/plans/`, implementer gets the path |
| Return a condensed summary, structured by headers; minimal tool set | CE · Sub-agent architectures, Minimal viable tool sets | fixed Plan / Report formats with size limits |
| Give a pass/fail check; ask for evidence (command + output) | BP · Give Claude a check to run | per-step `Verify`; Verification evidence table; verify hook |
| Frontmatter hooks; `PreToolUse` exit 2 as a backstop; `Stop` → `SubagentStop` | SA · Hooks in frontmatter; HK | `implementer-guard.mjs`, `implementer-verify.mjs` |
| Hard rules in hooks, guidelines in the prompt; keep the enforced set small | BP · Enforce steps with hooks | guard covers only "Do not touch" + review-gate escapes |
| `SubagentStop` input has `agent_id`, `agent_transcript_path`; exit 2 keeps it running | HK · SubagentStop | verify hook reads the agent's own edits, per-agent block counter |
| Specific prompt: files and what "done" looks like | BP · Write a specific prompt | plan steps: Files · Done when · Verify |
| Stopping conditions; pause on blockers | BEA · Agents | `maxTurns`; `BLOCKED` / `PARTIAL`; planner Step 0 |
| After two failed corrections, stop instead of a third try | BP · Steer the session | implementer: two failed fixes → `BLOCKED` |
| Fresh reviewer; a reviewer always finds something — skip style | BP · Review against your spec | implementer self-check limited to plan + checks |
| Simplest solution, add complexity only when needed | BEA | planner "keep it minimal"; implementer "minimal change" |

**Project rules** (this repo, not the sources above): package `AGENTS.md` beats a skill;
top-3 `INSIGHTS.md` entries per package (session protocol in [`../../AGENTS.md`](../../AGENTS.md));
test strategy from [`../../TESTING.md`](../../TESTING.md); insights recorded only by the main thread.
**Own rules without an official source:** "never weaken tests to make them pass"; clarifying
questions returned in the final message (subagents have no `AskUserQuestion`).

## Sources behind the review, test and doc agents

Fetched 2026-10-27 by `researcher` runs. **PERM** = [Permissions](https://code.claude.com/docs/en/permissions) ·
**EV** = [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) ·
**CCSR** = [claude-code-security-review](https://github.com/anthropics/claude-code-security-review) (its
[security-review.md](https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/.claude/commands/security-review.md) and
[prompts.py](https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/claudecode/prompts.py)); SA / BP / HK as above.

| Rule | Source | Applied in |
|---|---|---|
| `tools:` takes bare tool names; a `disallowedTools` specifier removes the whole tool — scope paths and commands with a `PreToolUse` hook | SA · Supported frontmatter fields, Conditional rules via hooks; PERM | `agent-guard.mjs` profiles |
| `Edit(path)` rules use gitignore patterns; Bash matching splits compound commands | PERM · Read and Edit, Wildcard patterns | guard path allowlists; per-segment Bash allowlist |
| `memory:` re-enables Write / Edit | SA · Enable persistent memory | no `memory` on any read-only agent |
| `skills:` preloads full content; without `Skill` the agent can't load more | SA · frontmatter `skills` | small per-job skill sets; `Skill` disallowed everywhere |
| Reviewer that "can't edit anything", enforced by tools; review against the spec; "skip style"; ask for evidence | BP · Review against your spec, Give Claude a check to run | plan-verifier, both reviewers: read-only tools, evidence per item / finding, no style |
| Grade with a different model; clear per-dimension rubric; an "Unknown" way out; partial credit | EV; [Define success criteria](https://platform.claude.com/docs/en/docs/test-and-evaluate/define-success) | plan-verifier on `opus` (implementer is `sonnet`); `PARTIAL` / `NOT_VERIFIABLE` |
| Traceability matrix: requirement → evidence → status; verification ≠ validation | [Traceability matrix](https://en.wikipedia.org/wiki/Traceability_matrix), [V&V](https://en.wikipedia.org/wiki/Verification_and_validation), [Spec Kit analyze](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md) | plan-verifier matrix and "Verification, not validation" |
| Test behaviour, not implementation; query by role; `app.inject` | [Dodds](https://kentcdodds.com/blog/testing-implementation-details), [Google Testing Blog](https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html), [Testing Library](https://testing-library.com/docs/queries/about/#priority), [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/) | test-writer hard rules and conventions |
| Keep a generated test only if it builds, passes reliably and catches a fault | [TestGen-LLM](https://arxiv.org/abs/2402.09171), [ACH mutation-guided tests](https://arxiv.org/abs/2501.12862) | test-writer: run twice, "Fails if" per test, verify hook |
| Dependency rule; baseline hides known violations | [Onion](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/), [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html), [dependency-cruiser CLI](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md) | architecture-reviewer: `KNOWN-EXTENDED`, new usages on legacy edges |
| Severity definitions, confidence ≥ 0.8, exploit scenario, hard exclusions, second-pass FP filter | CCSR | security-reviewer gates, "Do not report", filter pass |
| Severity bands 0.1–3.9 / 4–6.9 / 7–8.9 / 9+ | [GitHub SARIF](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning), [CVSS v4.0](https://www.first.org/cvss/v4-0/specification-document), [OWASP Risk Rating](https://community.owasp.org/OWASP_Risk_Rating_Methodology) | `security_severity` on the repo's 3-level scale |
| Vulnerability classes | [OWASP Top 10:2025](https://top10.owasp.org/2025), [OWASP LLM Top 10](https://genai.owasp.org/llm-top-10/) | security-reviewer threat model and `Class` field |
| ADR / MADR fields; Pugh matrix; one- vs two-way doors | [Nygard](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions), [MADR](https://adr.github.io/madr/), [Pugh method](https://en.wikipedia.org/wiki/Pugh_method), [AWS Day 1](https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/) | brainstorm output; ADR pages by doc-writer |
| Page types; docs as code; style | [Diátaxis](https://diataxis.fr/), [Docs as Code](https://www.writethedocs.org/guide/docs-as-code/), [Google style](https://developers.google.com/style/highlights) | doc-writer placement table and style |
| Mermaid C4 is experimental | [Mermaid C4](https://mermaid.js.org/syntax/c4.html) | doc-writer: flowchart / sequence / ER / state only |

**Own rules without an external source:** baseline / "do nothing" option in brainstorm; the
`MET / PARTIAL / NOT_MET / NOT_VERIFIABLE` vocabulary; "as built" docs with plan-vs-code
discrepancies in the report; `it.fails` + `// BUG(test-writer)` for a bug found by a test; the
"Do not report" items specific to this repo (no-login mode, local secrets file).
