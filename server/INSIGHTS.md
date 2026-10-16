# server — insights

Append-only log of **non-obvious** things learned while working here — what you couldn't
guess from the code. Entries are added by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) skill (or by hand in
the same format).

- **Add, never rewrite.** Existing lines are never edited, reordered or deleted. A correction is
  a new dated entry whose Insight starts with `Supersedes: "<old title>"`.
- **No duplicates.** Check this file and [AGENTS.md](AGENTS.md) first; titles are unique.
- New entries go at the **end** of their section. A human may promote a stable insight to
  `AGENTS.md` → Gotchas.

Entry format:

```md
### YYYY-MM-DD — short specific title
**Context:** what you were doing · **Insight:** what turned out to be true ·
**Evidence:** `path/to/file.ts:42` · **Apply when:** trigger for reusing it
```

---

## What Works

_Approaches and solutions that worked and are worth repeating._

## What Doesn't Work

_Dead ends and anti-patterns — what was tried and why it failed. The most skipped section, and the most valuable._

### 2026-10-12 — "latest review" tests: rows from one multi-row insert share `created_at`
**Context:** making PR-list FINDINGS count only the latest review. · **Insight:** "latest review"
means `ORDER BY reviews.created_at DESC` with no tie-breaker: both the list's SCORE/FINDINGS and
`reviewsForPull` (the popover's source) work this way. `created_at` defaults to `now()`, which is
fixed for the whole transaction, so `insert(t.reviews).values([a, b])` gives both rows the same
timestamp, and which one is "latest" is undefined. Set `createdAt` explicitly in such fixtures. ·
**Evidence:** `server/test/reviews.it.test.ts:247`, `server/src/modules/pulls/routes.ts:130`,
`server/src/modules/reviews/repository/review.repo.ts:66` · **Apply when:** writing a test or
seed that relies on review/run ordering.

### 2026-10-14 — the "hermetic" unit lane still writes to the dev DB: `buildApp()` reaps runs on boot
**Context:** eval runs of the onion-architecture skill ran `routes-smoke.test.ts` in scratch copies. ·
**Insight:** `buildApp()` always awaits `ReviewService.reapStaleRuns()`, with no `NODE_ENV=test`
guard. That is an `UPDATE agent_runs SET status='failed' WHERE status='running'`. `loadConfig`
reads `.env` (`import 'dotenv/config'`), and `DATABASE_URL` defaults to the local dev DB. So any
unit test that builds the app (`routes-smoke.test.ts`, "No-DB route smoke tests") connects to a
running dev Postgres and fails every in-flight review run there. Without a DB it only logs
"stale-run reaping failed (non-fatal)". Don't run the unit lane while a review is running locally.
Don't rely on "unit = no DB" for anything that calls `buildApp()`; a guard or an injected DB would
fix it. · **Evidence:** `server/src/app.ts:79`, `server/src/platform/config.ts:1`,
`server/src/modules/reviews/repository/run.repo.ts:105`, `server/test/routes-smoke.test.ts:11` ·
**Apply when:** writing or running a test that calls `buildApp()`, or when local runs turn `failed` unexpectedly.

## Codebase Patterns

_Conventions and architectural decisions (with the reason) that the code doesn't explain._

### 2026-10-07 — `server/package.json` is not actually skip-worktree
**Context:** reading TESTING.md while writing AGENTS.md. · **Insight:** TESTING.md says the file is
`skip-worktree`, but `git ls-files -v server/package.json` reports `H` (normal tracking). Edits
to it are committed like any other file. · **Apply when:** changing server scripts or deps.

### 2026-10-07 — the two `@devdigest/shared` copies have drifted
**Context:** comparing `server/src/vendor/shared` with `client/src/vendor/shared`. · **Insight:**
`adapters.ts` and `contracts/{eval-ci,knowledge,productionize,trace}.ts` differ (mostly doc
comments, not verified for type changes). · **Apply when:** touching any contract — diff both copies first.

### 2026-10-09 — reviews never use the working copy's git remote; clones are HTTPS + PAT
**Context:** checking whether switching this repo's `origin` to SSH breaks PR analysis. ·
**Insight:** PR data comes from Octokit (`GITHUB_TOKEN`); Repo Intel clones into its own
`cloneDir` with the token embedded in an https URL, and refresh always rebuilds
`https://github.com/<full_name>.git` — so an SSH URL entered in the UI only affects the first
clone (`withGitHubToken` leaves `git@…` untouched). · **Evidence:**
`server/src/modules/repos/service.ts:53`, `server/src/modules/repos/service.ts:121` ·
**Apply when:** changing git remotes/SSH setup, or debugging a private-repo clone that fails only on refresh.

### 2026-10-09 — persisted run traces are never re-parsed, so new `RunTrace` fields must be optional
**Context:** re-adding `cost_usd` to `RunStats` for the Run Cost Badge. · **Insight:**
`getRunTrace` returns the `run_traces.trace` JSONB cast `as RunTrace` (no Zod parse), so traces
written before a field existed reach the client without the key. Declare new trace fields
`.nullish()` (not `.nullable()`), and the UI must treat `undefined` as "no data". Run cost itself
is already computed by reviewer-core (`ReviewOutcome.costUsd`: OpenRouter `usage.cost`, else
`PriceBook`). The server only persists it, so no extra model call is needed. · **Evidence:**
`server/src/modules/reviews/repository/run.repo.ts:183`, `reviewer-core/src/review/run.ts:184` ·
**Apply when:** adding any field to `RunTrace`/`RunStats`, or surfacing run tokens/cost.

## Tool & Library Notes

_Quirks of dependencies, tools, CLIs and the environment._

### 2026-10-07 — a body-less POST reaches the Zod validator as `null`, not `undefined`
**Context:** moving `POST /pulls/:id/review` from `RunRequest.parse(req.body ?? {})` to `schema.body`.
· **Insight:** Fastify passes `null` for a missing body, so `Schema.default({})` still fails
("Expected object, received null"); use `Schema.nullish().transform((b) => b ?? {})`. ·
**Apply when:** giving an "empty body is OK" route a `schema.body`.

### 2026-10-09 — `pnpm db:migrate` prints a Postgres NOTICE that looks like an error
**Context:** applying migration `0010` (agent_runs.cost_usd). · **Insight:** `runMigrations`
runs `CREATE EXTENSION IF NOT EXISTS vector` first. postgres.js logs the resulting NOTICE as an
object dump ending in `routine: 'transformCreateStmt'`. It is harmless: success is the
`✓ migrations applied` line after it. · **Evidence:** `server/src/db/migrate.ts:23` ·
**Apply when:** `db:migrate` output looks like a stack/error object — check for the ✓ line before debugging.

### 2026-10-13 — dependency-cruiser path rules must match pnpm's `.pnpm/` layout
**Context:** writing and running the onion-architecture import rules against `server/src`. ·
**Insight:** under pnpm, npm imports resolve to `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`,
so a `to.path` like `^node_modules/drizzle-orm/` matches nothing and the rule passes without
reporting anything. Use `(^|/)node_modules/<pkg>/`. Running `pnpm exec depcruise ../reviewer-core/src`
from `server/` resolves `@devdigest/shared` through the server's tsconfig alias to
`src/vendor/shared/index.ts`, so exempt that path in reviewer-core rules. `tsPreCompilationDeps: true`
is needed for `dependencyTypesNot: ['type-only']` to see `import type`. · **Evidence:**
`.claude/skills/onion-architecture/references/enforcement.md` (configs verified: 16 server
violations, reviewer-core clean) · **Apply when:** writing any dependency-cruiser rule for server or reviewer-core.

### 2026-10-15 — a dependency-cruiser baseline matches `from → to` file pairs, not usages
**Context:** adding a baseline workflow to the onion-architecture skill (v2.0.0). · **Insight:**
`depcruise src --config X --output-type baseline --output-to known.json` (`depcruise-baseline` is the
deprecated alias), then `--ignore-known known.json`, hides every violation whose `{from, to, rule}`
is already listed. A new forbidden usage on a known edge, such as one more `this.container.x` read in a
legacy service that already imports the container, is therefore invisible. Paths must also match
exactly: a scratch copy with a symlinked `node_modules` resolves npm targets to different paths, so known
drizzle edges reappear there as "new". Build the baseline and the comparison from the same checkout
layout. · **Evidence:** a `known.json` entry is `{type, from, to, unresolvedTo, dependencyTypes, rule}`;
on `server/src` it lists 27 known and gives 0 new against the same tree, and 20 instead of 15 on a
symlinked copy · **Apply when:** using `--ignore-known` to judge whether a change added violations.

## Recurring Errors & Fixes

_An error that keeps coming back — quote its text — and the fix._

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

- 2026-10-09 — SSH remote switch + demo review PR: reviews never use the working copy's git remote; clones are HTTPS + PAT
- 2026-10-09 — Run Cost Badge: persisted run traces are never re-parsed, so new `RunTrace` fields must be optional, `pnpm db:migrate` prints a Postgres NOTICE that looks like an error

- 2026-10-12 — PR-list FINDINGS latest review only: "latest review" tests: rows from one multi-row insert share `created_at`

- 2026-10-13 — onion-architecture skill: dependency-cruiser path rules must match pnpm's `.pnpm/` layout
- 2026-10-14 — onion-architecture eval runs: the "hermetic" unit lane still writes to the dev DB: `buildApp()` reaps runs on boot
- 2026-10-15 — onion-architecture skill v2.0.0: a dependency-cruiser baseline matches `from → to` file pairs, not usages

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._
