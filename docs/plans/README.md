# Development plans

Approved plans produced by the [`implementation-planner`](../../.claude/agents/implementation-planner.md) agent and executed by the
[`implementer`](../../.claude/agents/implementer.md) agent.

- The planner works **only from a spec** (`<package>/specs/NNN-*.md`, root `specs/NNN-*.md` for
  cross-package features, or a full spec in the prompt). Specs come from `spec-creator`. It never writes specs: with no spec it returns `NEEDS_SPEC`, with a blocking
  ambiguity `NEEDS_CLARIFICATION`.
- The planner is read-only: it returns the plan, and the **main thread** saves it here after
  the user approves it. Before saving, the main thread asks the user which **execution mode**
  to use (the plan's "Execution mode — choose one" section) and replaces
  `Execution mode: AWAITING USER CHOICE` in the header with `single-agent` or `multi-agent`.
- Recommendations from the plan are not part of it until the user accepts them; an accepted
  one goes into the spec first, then the plan is re-run as a new revision.
- File name: `NNN-kebab-slug.md` — `NNN` is the next free three-digit number (`001-run-cost-badge.md`).
- The file is the plan as returned (`Status: READY`), **always in English**: the planner answers in
  the language of the request (that is what the user reads and approves in the terminal), and the
  main thread translates it to English when saving — same structure, steps, tables and evidence,
  code, paths and identifiers unchanged. Hand the implementer its path.
- A changed plan is a new revision of the same file, approved again before re-running the implementer.

- Steps hold production code only; new tests are rows `T-n` of the **Tests (test-writer)** table,
  written by `test-writer` from the spec's acceptance criteria. Existing tests the change breaks are
  listed under "Existing tests affected" as `compile` (implementer) or `assertion` (test-writer).

Flow: `spec-creator` → approved spec → `implementation-planner` → user approves + picks the mode →
saved here → **`/run-plan <path>`**: preflight + baseline → `implementer` (Steps; one run, or
workstreams in parallel across packages) → typecheck + dependency-cruiser → `test-writer` ∥
`architecture-reviewer` ∥ `security-reviewer` (by triggers) → merged fix loop (≤ 2 rounds) → Run
Report → **`plan-verifier` (manual)** → `doc-writer` (optional) → `pr-self-review` → commit ·
`/engineering-insights`. Details: [`.claude/skills/run-plan/SKILL.md`](../../.claude/skills/run-plan/SKILL.md).
