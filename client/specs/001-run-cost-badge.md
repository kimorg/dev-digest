# 001 — Run Cost Badge (client)
Status: done · Lesson: L01 (Task 3) · Related: ../../server/specs/001-run-cost-badge.md

## Goal
Show what agent runs cost, using the server's `cost_usd` fields — no extra model calls.

## Non-goals
- Cost charts / per-agent aggregates (Agent Performance) — later lesson.

## UI & routes
`RunCostBadge` (`src/components/run-cost-badge/`), two variants:
- `compact` → `$0.014` — **PR list** (`/repos/:repoId/pulls`) **COST** column (between Status and Updated): sum of all runs of the PR.
- `detailed` → `9,119 tok · $0.0013` —
  - **Agent runs timeline** (`RunHistory`): under the run time, only for settled (`done`) runs.
  - **VerdictBanner** (Review runs accordion): this run's tokens · cost; hidden without data.
- **Run trace drawer → Stats**: `COST` tile between TOKENS and FINDINGS (`formatCost`).

States: unknown cost → `—` (never `$0.00`); free model → `$0`; failed/running/cancelled
runs → no badge in the timeline. Precision: `<$0.01` 4 decimals, `<$1` 3, else 2 (`src/lib/format-cost.ts`).

## Data
- `PrMeta.cost_usd` (`usePulls`), `RunSummary.cost_usd` (`usePrRuns`), `RunTrace.stats.cost_usd` (`useRunTrace`).
- VerdictBanner gets its run via `FindingsTab` mapping `review.run_id → prRuns` (no new request).

## Acceptance criteria
- Each finished run shows its badge; a run without data shows `—`, not `$0.00`.
- PR list COST equals the sum of the PR's priced runs.
- Tests: `RunCostBadge.test.tsx`, `RunHistory.test.tsx`, `RunTraceDrawer.test.tsx`, `VerdictBanner.test.tsx`.

## Open questions
- None.
