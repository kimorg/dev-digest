# client — specs

One spec per feature or course lesson, written **before** implementation and kept as
the source of truth while the work is in progress. A feature that changes two or more
packages has **one** spec in the root [`specs/`](../../specs/README.md) folder instead.

This folder holds specs of features that change **only** this package. They are written by the
[`spec-creator`](../../.claude/agents/spec-creator.md) agent after you approve them, and
[`implementation-planner`](../../.claude/agents/implementation-planner.md) plans from them.

- File name: `NNN-<slug>.md`. `NNN` is one sequence across every spec folder.
- `Spec ID: SPEC-NNN` · Status: `draft` → `approved` → `implemented`
- The file is in English, has EARS acceptance criteria and no implementation details.
- Template and rules: [`specs/README.md`](../../specs/README.md).
- Specs `001`–`004` use the older template below. Keep them as they are.

## Legacy template (specs 001–004)

```md
# NNN — <feature>
Status: draft · Lesson: L0X · Related: ../../server/specs/NNN-….md

## Goal
## Non-goals
## UI & routes               (screens, states: loading / empty / error)
## Data                      (hooks, API endpoints, @devdigest/shared contracts)
## Acceptance criteria       (observable, testable)
## Open questions
```
