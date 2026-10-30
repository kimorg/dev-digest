# Development plans

Approved plans produced by the [`planner`](../../.claude/agents/planner.md) agent and executed by the
[`implementer`](../../.claude/agents/implementer.md) agent.

- The planner is read-only: it returns the plan, and the **main thread** saves it here after
  the user approves it.
- File name: `NNN-kebab-slug.md` — `NNN` is the next free three-digit number (`001-run-cost-badge.md`).
- The file is the plan as returned (`Status: READY`), **always in English**: the planner answers in
  the language of the request (that is what the user reads and approves in the terminal), and the
  main thread translates it to English when saving — same structure, steps, tables and evidence,
  code, paths and identifiers unchanged. Hand the implementer its path.
- A changed plan is a new revision of the same file, approved again before re-running the implementer.

Flow: `planner` → user approves → saved here → `implementer <path>` → architecture / security
reviewers → `pr-self-review` → commit · `/engineering-insights`.
