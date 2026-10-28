# Smart diff & intent

How `GET /pulls/:id/smart-diff` groups a PR's files, when it suggests a split, and which
linked files the intent layer reads.

## Role groups

Every changed file lands in exactly one of five groups, in this order:
`core`, `tests`, `wiring`, `docs`, `boilerplate`. The classifier is pure and path-based
(`server/src/modules/smart-diff/domain.ts` → `classifyFile`); the first matching role in
check order wins and `core` is the fallback. See `constants.ts` for the patterns.

The endpoint is workspace-scoped and reads the DB only — it never calls a model or GitHub.
A PR that has no files yet returns five empty groups.

## Split suggestion

`split_suggestion.too_big` is `true` when the PR changes more than **300 lines**
(additions + deletions). The threshold can be changed with `SMART_DIFF_SPLIT_THRESHOLD`.

- `total_lines` counts **core, tests, wiring and docs only**; lockfiles and other
  boilerplate are excluded, so a dependency bump never makes a PR "too big".
- `proposed_splits` keeps each change together with its tests: one split for
  `core + tests`, one for `wiring`, one for `docs`.

## Linked docs in the intent layer

The intent prompt includes up to 3 files linked from the PR description. Besides prose
(`.md`, `.mdx`, `.txt`) the intent layer now follows **specs**: `.yaml`, `.yml` and `.json`,
so an OpenAPI file linked from the description informs the PR intent.

Only repo-relative paths and same-repo GitHub blob URLs are followed; `..` escapes and
foreign repos are rejected. Config files are never read.
