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
colour); `—` when there are none. Click trigger (default): click → popover with **only that severity's** findings
(severity badge, title, category, `file:line` → GitHub blob at head sha, confidence,
2-line rationale). Same icon again / another icon / `Esc` / outside click / scroll closes or
switches. Portalled to `<body>` (`position: fixed`) because the table and accordions clip
overflow; flips above the trigger near the viewport bottom. Clicks never bubble to the row.
- **PR list** (`/repos/:repoId/pulls`) — FINDINGS column between Score and Status; counts come
  from the PR's **latest** review (dismissed included). Here the trigger is **hover**
  (`trigger="hover"`): the counts are plain text, and hovering or focusing the cell opens, after
  a short delay, one popover with **all** of the latest review's findings ordered by severity
  ("N findings · latest review"). The popover stays open while the pointer moves into it and closes
  shortly after it leaves (or on Esc / scroll). It fetches the PR's reviews on open (loading
  skeleton / error line).
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
- PR list: counts and popover use the latest review only; hovering the cell lists all its findings,
  CRITICAL first; clicks inside the cell or popover don't open the PR.
- Timeline: the popover lists only the clicked severity.
- Pills filter to one severity and toggle off.
- Tests: `FindingsSeverityCounts.test.tsx`, `RunHistory.test.tsx`, `FindingsPanel.test.tsx`.

## Open questions
- None.

## Revisions
- 2026-10-12 — PR list: latest review only; hover on the FINDINGS cell opens one all-severity
  popover (was click per severity). Timeline unchanged.
