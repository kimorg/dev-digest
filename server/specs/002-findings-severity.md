# 002 — Findings by severity (server)
Status: done · Lesson: L01 · Related: ../../client/specs/002-findings-severity.md

## Goal
Expose per-severity finding counts on the PR list so the UI can render the FINDINGS column
(icon + count per severity) without fetching every PR's reviews.

## Non-goals
- No new endpoint for the popover: it reuses `GET /pulls/:id/reviews`, fetched lazily on hover.
- No schema change / migration — counts are computed on read.

## Contracts / API changes
- `PrMeta.findings_counts: { critical, warning, suggestion } | null | undefined` (+ exported
  type `FindingsCounts`) → `GET /repos/:id/pulls` (list only). Mirrored in both vendored copies.
- Sums the **latest review of each agent** (newest `reviews` row with `kind = 'review'` per
  `(pr_id, agent_id)`; reviews with a null `agent_id` form one group), dismissed findings included.
  An agent's re-run replaces its earlier findings; a failed run creates no review, so the agent's
  previous review still counts. `score` stays the PR's single latest review. One grouped query over
  `findings` where `review_id IN (<latest ids>)`, `GROUP BY review_id, severity`, summed per PR.
  Reviews with no findings → all zeros; never reviewed → `null`.

## Acceptance criteria
- Agent A reviewed twice — older: CRITICAL, WARNING; newer: CRITICAL (dismissed), SUGGESTION — and
  agent B once in between: WARNING → `{ critical: 1, warning: 1, suggestion: 1 }`; an unreviewed PR → `null`.
- Covered by `test/reviews.it.test.ts` (PR list test) and `test/contracts.test.ts`.

## Open questions
- None.

## Revisions
- 2026-10-12 — counts cover the latest review only (were summed over all reviews).
- 2026-10-17 — counts sum the latest review of each agent (was the PR's single latest review).
