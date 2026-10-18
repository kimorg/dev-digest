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

### 2026-10-17 — a run is marked `done` before its trace is written: polling status then GET `/runs/:id/trace` can 404
**Context:** a new L02 test passed alone but failed in the full `.it.test` lane. · **Insight:**
`runOneAgent` calls `completeAgentRun(status 'done')` and only then builds and saves the
`run_traces` row. So `waitForPrRuns` (and a client polling the run status) can return before the trace
exists, and `GET /runs/:id/trace` answers 404. Any slow work between the two calls widens the gap.
The first `container.tokenizer.count()` loads the tiktoken BPE ranks and made it fail under
parallel load. Do slow work before `completeAgentRun`, and in tests poll the trace itself until it
returns 200. · **Evidence:** `server/src/modules/reviews/run-executor.ts:258`,
`server/src/modules/reviews/run-executor.ts:270`, `server/src/modules/reviews/run-executor.ts:315`,
`server/test/reviews.it.test.ts` (`runAndTrace`) · **Apply when:** adding work to the success path
of a run, or writing a test or UI that reads a trace right after the run finishes.

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

### 2026-10-17 — "latest run per agent" = latest `reviews` row per `(pr_id, agent_id)`; the rule is duplicated in the client
**Context:** making the PR-list FINDINGS column sum each agent's latest run. · **Insight:** only
a successful run writes a `reviews` row (`insertReview` on the success path). A failed or cancelled
run updates `agent_runs` only. So grouping `reviews` by agent gives the latest *successful* run
(the user chose this: a failed re-run keeps the agent's previous findings). Grouping `agent_runs`
would give a run with no findings. `reviews.agent_id` is nullable with no FK; legacy/seed rows with
null form one group. The same rule is re-implemented client-side for the hover popover
(`latestReviewPerAgent`). Change both, or the counts and the popover list stop matching. ·
**Evidence:** `server/src/modules/reviews/run-executor.ts:218`, `server/src/modules/reviews/run-executor.ts:296`,
`server/src/modules/pulls/routes.ts:143`, `client/src/components/findings-severity/helpers.ts:32` ·
**Apply when:** changing which reviews/runs the PR list's FINDINGS (or any per-agent aggregate) uses.

### 2026-10-17 — skills scaffolding is half-wired: links persist, but no run ever loads them
**Context:** writing the L02 Skills spec. · **Insight:** `GET|POST /agents/:id/skills` and the
`agent_skills` table work, but `runOneAgent` calls `reviewPullRequest` without `skills`, so linked
skills have no effect on a review. The link repository is not safe to build on as it is:
`setSkills` deletes then inserts without a transaction, `setSkills` and `linkSkill` never check that
the skill belongs to the agent's workspace (only the agent is checked), and `linkedSkills` does not
filter `skills.enabled`. Changing links neither bumps the agent version nor snapshots it. ·
**Evidence:** `server/src/modules/reviews/run-executor.ts:190`,
`server/src/modules/agents/repository.ts:192`, `server/src/modules/agents/repository.ts:229` ·
**Apply when:** implementing skills (spec `server/specs/003-skills.md`) or anything that reads agent↔skill links.

### 2026-10-17 — a seeded agent joins every "Run all" review and gets no `agent_versions` v1
**Context:** seeding Test Quality Reviewer. · **Insight:** `seed.ts` inserts `agents` rows
directly (not through `AgentsRepository.insert`), so seeded agents have no `agent_versions` v1
snapshot. A seeded `enabled: true` agent is picked by "Run all" (`listEnabled`), so every new
seeded agent adds one LLM call (time and cost) to every full review. Seeded skills get their v1
`skill_versions` row written by hand in the seed for the same reason. · **Evidence:**
`server/src/db/seed.ts:221`, `server/src/modules/reviews/service.ts:50` · **Apply when:** adding a
seeded agent or skill, or reading an agent's version history.

### 2026-10-17 — skills are now wired into runs; the link guards are in place
**Context:** implementing `server/specs/003-skills.md`. · **Insight:** Supersedes: "skills
scaffolding is half-wired: links persist, but no run ever loads them". `runOneAgent` now injects
`listEnabledSkillsForAgent` (linked AND `skills.enabled`, in `agent_skills.order`) as
`<skill name=… version=…>` blocks under `## Skills / rules`. `setSkills` is transactional, and both
link routes 404 on another workspace's skill. Links still do not bump the agent version. The trace's
`prompt_assembly.skill_refs` is the record of which skill versions a run used. · **Evidence:**
`server/src/modules/reviews/run-executor.ts:258`, `server/src/modules/agents/service.ts`
(`assertSkillsInWorkspace`) · **Apply when:** reasoning about what a run's prompt contained, or changing skill links.

### 2026-10-18 — a new module only passes the onion rules if its repository returns contract DTOs
**Context:** the PR self-review blocked `modules/skills`. Its `SkillService(container)` built its own
`SkillRepository`, the same legacy pattern `modules/agents` still uses (that one is in the depcruise
baseline, so it isn't reported). · **Insight:** the rules leave no place for row types in the port.
`ports.ts` may not import `db/rows`. A service may not import anything from `repository.ts`, not even
a type. A repository may import only `ports.ts`, `helpers.ts` and domain files from its module. So the
port has to be written in contract types. The repository maps rows to DTOs itself, through
`helpers.ts`, and implements the port. Input types (`NewSkill`, `SkillPatch`) live in `ports.ts`.
`wiring.ts` builds the service from `container.db`, and routes call the wiring function. A pure helper
that needs an adapter takes a plain function (`countPromptTokens(assembly, count)`), not the adapter's
type. · **Evidence:** `server/src/modules/skills/ports.ts`, `server/src/modules/skills/wiring.ts`,
`server/src/modules/reviews/helpers.ts:115` · **Apply when:** adding a module or a new service, or
when depcruise reports `application-no-repository` / `application-no-container`.

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

### 2026-10-17 — fflate `unzipSync` with `filter: () => false` lists a zip without inflating anything
**Context:** writing the zip-bomb-safe skill importer. · **Insight:** `unzipSync(bytes, { filter })`
calls `filter` once per entry with `{ name, size, originalSize, compression }` read from the
central directory, and decompresses only the entries it returns `true` for. A first pass that
returns `false` therefore gives the whole listing (names + **declared** uncompressed sizes) at no
inflate cost. A second pass inflates just the wanted entry. `originalSize` is what the archive
claims, so re-check the inflated byte length too. A non-zip input throws, so catch and map it to a
422. · **Evidence:** `server/src/modules/skills/import.ts:66`, `server/src/modules/skills/import.ts:100`,
`server/test/skills-import.test.ts` (zip-bomb case) · **Apply when:** reading any uploaded archive.

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
- 2026-10-17 — PR-list FINDINGS per agent: "latest run per agent" = latest `reviews` row per `(pr_id, agent_id)`; the rule is duplicated in the client
- 2026-10-17 — L02 Skills spec + Test Quality Reviewer seed: skills scaffolding is half-wired: links persist, but no run ever loads them, a seeded agent joins every "Run all" review and gets no `agent_versions` v1
- 2026-10-17 — L02 Skills server implementation: a run is marked `done` before its trace is written: polling status then GET `/runs/:id/trace` can 404, skills are now wired into runs; the link guards are in place, fflate `unzipSync` with `filter: () => false` lists a zip without inflating anything
- 2026-10-18 — fix depcruise CRITICALs in skills/reviews: a new module only passes the onion rules if its repository returns contract DTOs

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._
