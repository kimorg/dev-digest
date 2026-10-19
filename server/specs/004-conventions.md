# 004 — Conventions Extractor: scan, evidence gate, review, skill draft (server)
Status: active · Lesson: L02 · Related: ../../client/specs/004-conventions.md · ./003-skills.md

## Goal
Turn a repo's unwritten house rules into a reviewable list. **Code** picks the samples, the
`conventions` feature model (Settings → Models) proposes candidate rules with evidence, and
**code** checks that evidence against the clone. A candidate whose evidence doesn't hold is
dropped. The user accepts, rejects or edits candidates; the accepted ones are merged into one
`convention` skill (default name `repo-conventions`) that is saved through `POST /skills`.

Groundwork that already existed and is reused: the `conventions` table (`0000_init`), the
`ConventionCandidate` contract, `SkillType 'convention'` / `SkillSource 'extracted'`, the
`conventions` entry in `FEATURE_MODELS`, `repoIntel.getConventionSamples`, and the
`MockLLMProvider.structuredBySchema['ConventionExtraction']` slot.

## Non-goals
- A background job / polling: the scan is one synchronous request (decision 2026-10-18).
- A second model call to pick samples (the mock's "2-step dialogue" comment): sampling is code only.
- Keeping a full history of scans in the UI: only the latest scan is shown.
- Seeding demo candidates: a scan needs a model key.

## Contracts / API changes

### DB — `pnpm db:generate --name conventions_extractor` → `0012_conventions_extractor`
- `conventions` (was empty): + `scan_id` (FK → `convention_scans`, `on delete set null`),
  `category text not null default 'other'`, `evidence_line_start int`, `evidence_line_end int`,
  `status text ('pending'|'accepted'|'rejected') not null default 'pending'`, `created_at`,
  `updated_at`; `accepted bool` dropped (replaced by `status`). Index
  `conventions_repo_status_idx (repo_id, status)`.
- New `convention_scans`: `id`, `workspace_id`, `repo_id` (cascade), `status ('done'|'failed')`,
  `model`, `sample_files jsonb string[]`, `candidate_count`, `dropped_count`, `error`, `created_at`.
  Index `convention_scans_repo_created_idx (repo_id, created_at)`.

### `@devdigest/shared` (`contracts/knowledge.ts`, **both** vendored copies)
- `ConventionStatus` = `pending | accepted | rejected`; `CONVENTION_RULE_MAX = 500`.
- `ConventionCandidate` = `{ id, repo_id, rule, evidence_path, evidence_line_start,
  evidence_line_end, evidence_snippet, confidence (0..1), status, created_at, updated_at }`.
- `ConventionScan` = `{ id, repo_id, status, model, sample_files, sample_count, candidate_count,
  dropped_count, error, created_at }`.
- `RepoConventions` = `{ scan: ConventionScan | null, candidates: ConventionCandidate[] }` —
  latest scan + non-rejected candidates, highest confidence first.
- `UpdateConventionRequest` = partial `{ rule, status }`, at least one key.
- `SetConventionsStatusRequest` = `{ ids: uuid[] (1–200), status: 'pending' | 'accepted' }`.
- `ConventionSkillDraft` = `{ name, description, type, body, convention_count, evidence_files }`.
- `CreateSkillRequest`: `source` += `'extracted'`; optional `enabled` (overrides the source default)
  and `evidence_files` (stored in `skills.evidence_files`).

### Model output (`modules/conventions/types.ts`, `schemaName: 'ConventionExtraction'`)
`{ candidates: [{ category, rule, evidence: { file, line_start, line_end, code }, confidence }] }`
— category, rule, evidence as file + line, confidence (#40). `code` is the model's quote of the
cited lines; it is used only to verify, never stored. `category` (enum in `types.ts`) only steers
the model: it is dropped after verification — not stored, not returned, not shown.

### Module `src/modules/conventions/`
`routes → service → ports`, `repository`, `domain` (pure rules), `prompt`, `wiring`. The model
choice comes from the new settings facade `FeatureModels` (`modules/settings/types.ts`,
`container.featureModels`), so the module never imports another module's internals.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/repos/:id/conventions` | `RepoConventions` |
| POST | `/repos/:id/conventions/extract` | Runs a scan (sync) → `RepoConventions` (#38) |
| PUT | `/conventions/:id` | `UpdateConventionRequest` → `ConventionCandidate` |
| POST | `/repos/:id/conventions/set-status` | Accept all / Deselect all → `RepoConventions`; rejected rows untouched |
| GET | `/repos/:id/conventions/skill-draft` | `ConventionSkillDraft` from the accepted candidates; persists nothing (#42) |

All routes are workspace-scoped: another workspace's repo or candidate → 404.

### The scan
1. **Samples, code only (#39):** every root config in `CONFIG_SAMPLE_PATHS` (eslint / tsconfig /
   prettier variants) that exists, plus `repoIntel.getConventionSamples(repoId, 12)`. Files are
   read through the git adapter; empty / missing ones are skipped. None at all → 422
   `conventions_no_samples`.
2. **One model call** with the samples rendered as `NN | code` inside `wrapUntrusted` blocks and
   reviewer-core's `INJECTION_GUARD` (now exported, unchanged) appended to the system prompt.
   At most 250 lines × 240 chars per sample.
3. **Evidence gate** (`verifyEvidence`, pure): the path is repo-relative (no absolute, `..`, `\`,
   NUL); the file exists; `1 ≤ line_start ≤ line_end ≤ lineCount`, span ≤ 20; the quoted code
   (whitespace-normalised, ≥ 6 chars) is found on consecutive non-blank lines starting within
   the cited range ± 2 lines; the range widens to cover the match. The stored snippet is the
   file's real text. Failures count in `dropped_count`. The evidence file may be any repo file,
   not only a sample.
4. **Dedupe + persist:** one candidate per normalised rule (highest confidence), none whose rule
   is already accepted or rejected, max 15. One transaction deletes the repo's **pending**
   candidates and inserts the `done` scan and the new candidates. A model failure writes a
   `failed` scan (with the error) and keeps the candidates; the route answers 502 (or the
   `AppError` it got, e.g. a missing key).
5. A second scan of the same repo while one runs → 409 `conventions_scan_running` (in-memory guard).

The git adapter's `readFile` now refuses any path that resolves outside the clone.

### Skill draft
Name `repo-conventions`; description `N house conventions extracted from <repo>`; type
`convention`; body `# repo-conventions`, an intro line, then per rule `## <slug>` + rule +
`Detected in \`path:a-b\`:` and a fenced snippet (fence longer than any backtick run
in it). If the body exceeds the skill limit, snippets are left out. No accepted candidate → 422
`no_accepted_conventions`.

## Acceptance criteria
(`#n` = requirement number in the L02 brief.)
- #38 `POST /repos/:id/conventions/extract` runs the scan; `GET` after it (and after a restart)
  returns the same scan and candidates.
- #39 repo-intel is asked for exactly 12 files; the model receives configs + those files only;
  no model call happens before the analysis call.
- #40 the model is called once with `schemaName: 'ConventionExtraction'` and the model chosen in
  Settings → Models → Conventions.
- Evidence: a wrong quote, a missing file and a `../` path are all dropped (`dropped_count`).
- #48 a rejected candidate disappears from `GET`, from the draft, and is not proposed again by a re-scan.
- Re-scan keeps accepted candidates and replaces pending ones.
- #42 the draft is built from accepted candidates only, named `repo-conventions`; saving it with
  `source: 'extracted'`, `enabled: false` round-trips and the skill is listed by `GET /skills` (#52).
- Failed model call → 502, `scan.status = 'failed'` with the error, candidates unchanged.
- Workspace isolation (404), empty update body (422), no samples (422), concurrent scan (409).
- Tests: `test/conventions-domain.test.ts` (unit: gate, paths, rendering, dedupe, draft, prompt),
  `test/conventions.it.test.ts` (routes on Postgres, mock LLM / git / repo-intel),
  `test/contracts.test.ts` (new contracts).

## Open questions
Resolved 2026-10-18 (user): default skill name `repo-conventions`; re-scan replaces pending
candidates only; synchronous scan; buttons "Run Scan" / "Re-scan".

## Revisions
- 2026-10-18 — category removed from storage and API (user): migration
  `pnpm db:generate --name drop_convention_category` → `0013_drop_convention_category` drops
  `conventions.category`; `ConventionCategory` leaves `@devdigest/shared` (both copies) and lives
  only in the module's LLM schema; `PUT /conventions/:id` no longer accepts `category`; the skill
  draft has no `Category:` line. A separate migration (not a rewrite of `0012`) because `0012` was
  already applied to the dev DB.
- 2026-10-18 — evidence links to GitHub (user): migration `0014_add_convention_scan_head_sha` adds
  `convention_scans.head_sha` (the clone's `git.currentHead()` when the scan starts; null if it can't
  be read — the scan still runs). `ConventionScan.head_sha: string | null` in both contract copies.
