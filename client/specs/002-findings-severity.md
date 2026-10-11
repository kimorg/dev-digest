# 002 — Findings by severity: counts, popover, pill filters (client)
Status: done · Lesson: L01 · Related: ../../server/specs/002-findings-severity.md

## Goal
Show how many findings of each severity a PR / a run has, let the user peek at them in a
popover, and filter a review run's findings by severity.

## Non-goals
- No actions (accept/dismiss) from the popover — it is read-only.
- No multi-select severity filter.

## UI & routes
`FindingsSeverityCounts` + `FindingsPopover` (`src/components/findings-severity/`):
one clickable `icon count` per severity with count > 0 (dotted underline in the severity
colour); `—` when there are none. Click → popover with **only that severity's** findings
(severity badge, title, category, `file:line` → GitHub blob at head sha, confidence,
2-line rationale). Same icon again / another icon / `Esc` / outside click / scroll closes or
switches. Portalled to `<body>` (`position: fixed`) because the table and accordions clip
overflow; flips above the trigger near the viewport bottom. Clicks never bubble to the row.
- **PR list** (`/repos/:repoId/pulls`) — FINDINGS column between Score and Status; counts are
  summed over all of the PR's reviews (dismissed included). The popover fetches the PR's
  reviews on open (loading skeleton / error line).
- **Agent runs → Timeline** (`RunHistory`) — counts for that run only, replacing the
  "N finding(s)" text (kept as fallback when the run's review isn't loaded or has 0 findings);
  `· N blockers` stays. Popover uses the already-loaded findings (no request).
- **Review runs** (`FindingsPanel`) — `Chip` pills "Critical 2", "Warning 1"… (only non-zero
  severities, counted over all of the run's findings). Single-select: click activates, click
  again clears, another pill replaces it. Combines with "Hide low confidence".

## Data
- `PrMeta.findings_counts` (`usePulls`); `usePrReviews(prId)` for the PR-list popover;
  timeline uses `FindingsTab`'s `runs` (`review.run_id → findings`).

## Acceptance criteria
- Counts per severity match the findings (dismissed included); zero severities are hidden.
- The popover lists only the clicked severity; clicking a count in a PR row doesn't open the PR.
- Pills filter to one severity and toggle off.
- Tests: `FindingsSeverityCounts.test.tsx`, `RunHistory.test.tsx`, `FindingsPanel.test.tsx`.

## Open questions
- None.
