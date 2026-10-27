# DevDigest — agent map

Local-first AI pull-request reviewer; the **course starter** — lessons L01–L08 each add
one feature back. Overview, architecture and lesson table: [README](README.md).

## Packages

Four standalone packages — each has its own `AGENTS.md` with stack, commands and rules.

| Folder           | Package                    | Role                                        | Port | PM   |
|------------------|----------------------------|---------------------------------------------|------|------|
| `server/`        | `@devdigest/api`           | Fastify API + Postgres, runs reviews        | 3001 | pnpm |
| `client/`        | `@devdigest/web`           | Next.js studio UI                           | 3000 | pnpm |
| `reviewer-core/` | `@devdigest/reviewer-core` | Pure review engine: diff → LLM → findings   | —    | npm  |
| `e2e/`           | `@devdigest/e2e`           | Deterministic browser flows (agent-browser) | —    | npm  |

Package maps: [server](server/AGENTS.md) · [client](client/AGENTS.md) ·
[reviewer-core](reviewer-core/AGENTS.md) · [e2e](e2e/AGENTS.md)

## Commands

- Whole stack from zero: `./scripts/dev.sh` (`--db-only`, `--no-client`, `--no-seed`).
  Only Postgres (pgvector) runs in Docker; API and web run on the host.
- Tests are per package — see [TESTING.md](TESTING.md) for the suite map and CI lanes.
- PR self-review hooks, once per clone: `git config core.hooksPath .githooks` (`dev.sh` does it).
- Requires Node ≥ 22, pnpm ≥ 10, Docker.

## Gotchas

- **Not a workspace.** Install inside each package with *its* package manager
  (`server`/`client` → pnpm, `reviewer-core`/`e2e` → npm). Root `package.json`,
  `pnpm-lock.yaml` and `pnpm-workspace.yaml` files are git-ignored strays — don't recreate them.
- Cross-package code is shared via **tsconfig path aliases**, not published packages.
- `@devdigest/shared` (Zod contracts) is **vendored twice**: `server/src/vendor/shared`
  (also used by reviewer-core) and `client/src/vendor/shared`. The copies have already
  drifted; a contract change must be applied to both.
- `server/clones/` is runtime data (imported repos — including a clone of *this* repo).
  Never edit it; exclude it from searches or you'll hit duplicate files.
- CI is path-filtered per package; `reviewer-core/**` also triggers the server workflows.

## Session protocol

1. **Start:** before working in a package, read its `INSIGHTS.md` and state the top 3 points
   relevant to the task. Treat them as high-confidence guidance unless the user says otherwise.
2. **End:** before the final answer of any task that changed files in a package, run the
   `engineering-insights` skill (`/engineering-insights`). Do not skip it — "nothing new" is a
   fine result. Also run it right after any non-obvious discovery.
3. `INSIGHTS.md` files are **append-only and duplicate-free**: never edit, reorder or delete an
   existing entry; a correction is a new dated entry.
4. **PR self-review (all agents, no exceptions).** Git hooks in `.githooks/` block `commit` and
   `push` until the review passes (enable once: `git config core.hooksPath .githooks`).
   - Before `git commit`: read and follow `.claude/skills/pr-self-review/SKILL.md`.
     Re-run it after *any* further edit; the hook compares file hashes.
   - Before `gh pr merge`: run `node .claude/skills/pr-self-review/scripts/check.mjs pr-merge [<n>]`
     and proceed only on exit 0.
   - Verdict `BLOCKED` (any CRITICAL) → fix and re-run; never lower a severity, edit
     `.git/pr-self-review/`, use `--no-verify` or `PR_SELF_REVIEW_SKIP`. If the user asks to skip,
     say a CRITICAL is open and let them run the command themselves.

## Where docs live

- Per package: `README.md` (overview) · `docs/` (deep reference) · `specs/` (feature specs)
  · `INSIGHTS.md` (learned gotchas). Read them when the task touches that package.
- Root `docs/agent-prompts/` — reviewer system-prompt library (General, Security, Performance).
- Root `docs/plans/` — approved Development Plans (`NNN-<slug>.md`) from `planner`, executed by `implementer`.
