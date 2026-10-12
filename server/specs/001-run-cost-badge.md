# 001 — Run Cost Badge (server)
Status: done · Lesson: L01 (Task 3) · Related: ../../client/specs/001-run-cost-badge.md

## Goal
Persist the USD cost of every agent run and expose it on the read routes, so the UI can show
cost per run (timeline, trace, verdict banner) and the total per PR (PR list COST column).

## Non-goals
- No extra model calls: cost comes from the existing `reviewer-core` outcome (`costUsd` =
  OpenRouter `usage.cost`, else `PriceBook.estimate` / static `estimateCost`; null for unpriced models).
- No cost for CI/eval runs beyond what already exists; no budgets/alerts.

## Contracts / API changes
- DB: `agent_runs.cost_usd double precision NULL` (migration `0010`). Rows from before the
  feature stay NULL.
- `RunStats.cost_usd: number | null | undefined` (nullish — traces are JSONB and older ones lack the key).
- `RunSummary.cost_usd: number | null` → `GET /pulls/:id/runs`.
- `PrMeta.cost_usd: number | null | undefined` → `GET /repos/:id/pulls` (list only):
  `SUM(agent_runs.cost_usd)` over all runs of the PR. SUM skips NULLs; null when no run has a cost.
- `GET /runs/:id/trace` → `stats.cost_usd`.

## Acceptance criteria
- A completed run stores `cost_usd` = engine `costUsd`; failed/cancelled runs store NULL.
- PR list cost = sum of known run costs; PR without priced runs → `null`.
- Deleting a run removes its cost from the PR total.
- Covered by `test/reviews.it.test.ts` and `test/contracts.test.ts`.

## Open questions
- Should partially-completed map-reduce runs that fail mid-way record the cost spent so far? (Today: NULL.)
