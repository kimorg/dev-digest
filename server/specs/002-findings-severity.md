# 002 — Findings by severity (server)
Status: done · Lesson: L01 · Related: ../../client/specs/002-findings-severity.md

## Goal
Expose per-severity finding counts on the PR list so the UI can render the FINDINGS column
(icon + count per severity) without fetching every PR's reviews.

## Non-goals
- No new endpoint for the popover: it reuses `GET /pulls/:id/reviews`, fetched lazily on click.
- No schema change / migration — counts are computed on read.

## Contracts / API changes
- `PrMeta.findings_counts: { critical, warning, suggestion } | null | undefined` (+ exported
  type `FindingsCounts`) → `GET /repos/:id/pulls` (list only). Mirrored in both vendored copies.
- Computed with one grouped query: `findings ⨝ reviews` where `reviews.kind = 'review'`,
  `GROUP BY pr_id, severity`. Summed over **all** of the PR's reviews, dismissed findings
  included. A PR with reviews but no findings → all zeros; never reviewed → `null`.

## Acceptance criteria
- Two reviews of one PR with CRITICAL, WARNING, CRITICAL (dismissed), SUGGESTION →
  `{ critical: 2, warning: 1, suggestion: 1 }`; an unreviewed PR → `null`.
- Covered by `test/reviews.it.test.ts` (PR list test) and `test/contracts.test.ts`.

## Open questions
- None.
