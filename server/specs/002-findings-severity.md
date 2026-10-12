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
- Counts only the PR's **latest** review (newest `reviews` row with `kind = 'review'` — the same
  review as `score`), dismissed findings included: one grouped query over `findings` where
  `review_id IN (<latest ids>)`, `GROUP BY review_id, severity`. A latest review with no findings →
  all zeros; never reviewed → `null`.

## Acceptance criteria
- Two reviews of one PR — older: CRITICAL, WARNING; newer: CRITICAL (dismissed), SUGGESTION →
  `{ critical: 1, warning: 0, suggestion: 1 }`; an unreviewed PR → `null`.
- Covered by `test/reviews.it.test.ts` (PR list test) and `test/contracts.test.ts`.

## Open questions
- None.

## Revisions
- 2026-10-12 — counts cover the latest review only (were summed over all reviews).
