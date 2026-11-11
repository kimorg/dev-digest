# reviewer-core — specs

One spec per engine change or course lesson, written **before** implementation and kept
as the source of truth while the work is in progress. An engine change driven by a server
feature changes two packages, so its spec goes in the root [`specs/`](../../specs/README.md) folder.

This folder holds specs of features that change **only** this package. They are written by the
[`spec-creator`](../../.claude/agents/spec-creator.md) agent after you approve them, and
[`implementation-planner`](../../.claude/agents/implementation-planner.md) plans from them.

- File name: `NNN-<slug>.md`. `NNN` is one sequence across every spec folder.
- `Spec ID: SPEC-NNN` · Status: `draft` → `approved` → `implemented`
- The file is in English, has EARS acceptance criteria and no implementation details.
- Template and rules: [`specs/README.md`](../../specs/README.md).
- The older template below is for reference only. New specs use the template in `specs/README.md`.

## Legacy template (reference)

```md
# NNN — <feature>
Status: draft · Lesson: L0X · Related: ../../server/specs/NNN-….md

## Goal
## Non-goals
## Pipeline change           (prompt slots, structured output, grounding, run/reduce)
## Public API / contracts    (src/index.ts exports, @devdigest/shared types)
## Safety                    (untrusted inputs wrapped? grounding still enforced?)
## Acceptance criteria       (testable with a stubbed LLMProvider)
```
