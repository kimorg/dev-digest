# 004 — Conventions page: scan, review candidates, create skill (client)
Status: active · Lesson: L02 · Related: ../../server/specs/004-conventions.md · ./003-skills.md

## Goal
A **Conventions** page in SKILLS LAB: scan the selected repo for house rules, review each
candidate with its evidence (file:lines, the real code, confidence), accept / reject / edit it in
place, and turn the accepted ones into one skill through a modal where everything — including the
body — is editable.

## Non-goals
- Background scans with progress polling (the scan is one request; the page shows "Scanning…").
- Scan history, candidate search / filters, syntax-highlighted body editing.
- An e2e flow: a scan needs a model key, the e2e lane has none.

## UI & routes
(`#n` = requirement number in the L02 brief.)

### Navigation
- `nav.ts`: **Conventions** (`ListChecks`) in **SKILLS LAB** after Agents (#44), href
  `/repos/:repoId/conventions` (repo-scoped, like Pull Requests). `activeKeyFor()` already maps
  `/conventions`; `shell.json` already has `nav.conventions`.
- `routes.conventions(repoId)`. Breadcrumb: `Skills Lab › Conventions`.

### `/repos/[repoId]/conventions` — `ConventionsView`
- Heading "Conventions in `<repo name>`" (mono, accent). Subtitle: before a scan, the page
  purpose; after, "Detected from N sample files · last scan <relative time>", plus "N candidates
  dropped: evidence didn't match the code" when > 0, or the failed scan's error (`role=alert`).
- Header button (#45): **Run Scan** (primary) until the repo has a scan, then **Re-scan**
  (secondary). While the request runs: "Scanning…", spinner, disabled.
- States: loading skeletons · load error (`ErrorState` + Retry) · no scan → `EmptyState` with
  **Run Scan** · scanning with no cards → "Scanning…" panel · a scan with no candidates →
  "No conventions found" · otherwise the toolbar + cards. Unknown repo → `RepoNotFound`.
- `ConventionsToolbar`: **Accept all** (or **Deselect all** when all are accepted), "X of Y
  accepted", and **Create skill** only when ≥ 1 is accepted (#50).
- `ConventionCard` (#46, #47, #49): italic rule; evidence header
  `path:start-end` with a copy button, the snippet in a code block; confidence bar + % (≥ 80 green,
  ≥ 60 amber, else red); buttons **Accept** (toggles; "Accepted", filled, `aria-pressed`),
  **Reject** (the card leaves the list; persisted, #48), **Edit** (inline rule textarea,
  Save / Cancel; sent only when the rule changed). Accepted cards get a green left border.
- Model errors are toasted by the global mutation handler; the page refetches to show the failed scan.

### `CreateConventionSkillModal` (#41, #51)
- Title "Create skill from conventions", subtitle = current name. Banner (`role=note`): "Merged
  from **N accepted conventions** in `<repo>`. Everything below is editable before you save."
- Fields: Name\* (mono), Description\*, Type (default `convention`), Enabled toggle ("Whether this
  block is added to agents' prompts."), Skill body\* in `SkillBodyEditor` — header
  `<name>.md` · "unsaved" · "N tokens", line-number gutter + no-wrap mono textarea.
- Footer: "Saved as v1 · added to Skills Lab", **Cancel**, **Create skill** (disabled until the
  required fields are filled). Posts `{ …, source: 'extracted', enabled, evidence_files }` via
  `useCreateSkill` (invalidates `["skills"]`, so the skill shows on `/skills`, #52). 409 → inline
  error under Name. Success → close + toast.

## Data
- `src/lib/hooks/conventions.ts`: `useRepoConventions(repoId)` (`["repo-conventions", repoId]`),
  `useExtractConventions`, `useUpdateConvention` (patches the cached list; a rejected one is
  removed), `useSetConventionsStatus`, `useConventionSkillDraft(repoId, enabled)`
  (`["convention-skill-draft", repoId]`, dropped after every write).
- Shared helpers moved to `src/lib/skill-form.ts` (`isNameTakenError`, `estimateTokens`,
  `toSkillFileName`) — now used by Skills Lab and Conventions.
- Contracts: `RepoConventions`, `ConventionCandidate`, `ConventionScan`, `UpdateConventionRequest`,
  `SetConventionsStatusRequest`, `ConventionSkillDraft`, `CreateSkillRequest` (+ `extracted`,
  `enabled`, `evidence_files`) — mirrored from the server copy.

## Acceptance criteria
- #44 Conventions is listed under SKILLS LAB, not WORKSPACE.
- #45 Run Scan before the first scan, Re-scan after.
- #46 #47 after a scan each card shows rule, source file, confidence % and Accept / Reject / Edit.
- #48 a rejected card is gone and stays gone after reload.
- #49 Edit changes the card in place.
- #50 Create skill appears only with ≥ 1 accepted candidate.
- #41 #51 the modal explains the merge, has Name / Description (+ Type, Enabled, Body), Cancel / Create.
- #52 after Create the new skill is in the Skills list.
- Tests: `ConventionsView`, `ConventionsToolbar`, `ConventionCard`, `CreateConventionSkillModal`,
  `SkillBodyEditor`, `lib/skill-form.test.ts`, `lib/routes.test.ts`.

## Open questions
None (decisions of 2026-10-18 are in the server spec).

## Revisions
- 2026-10-18 — category removed from the card and the inline editor (user); see the server spec.
- 2026-10-18 — the card's `path:start-end` is a link to the lines on GitHub (`githubBlobUrl`, new tab,
  external-link icon): `github.com/<full_name>/blob/<scan.head_sha ?? repo.default_branch>/<path>#L<a>-L<b>`.
  Pinned to the scanned commit so the line anchors match the evidence; old scans fall back to the default branch.
