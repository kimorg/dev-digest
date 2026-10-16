# PR Self-Review Skill

**Version:** 1.0.0 · **Scope:** quality gate on local changes, for all agents and humans

## Motivation

The repo has a dozen skills, but each one only runs when an agent decides it is relevant. Nothing
made sure that, before a PR, the UI skills had looked at the UI files and the backend architecture
skills at the backend files, or that a critical problem stopped the PR.

This skill does that, and it does not depend on one AI tool. The agent (any agent) runs the
review. Plain **git hooks** enforce the result, because every agent and every human goes through git.

## How it works

```
edit code
  │
  ▼
review (SKILL.md)   collect.mjs ─► per-skill review of changed lines ─► verdict.mjs
  │                 └─► .git/pr-self-review/result.json  { verdict, files: {path: hash}, findings }
  ▼
git commit ─► pre-commit  ─► check.mjs commit   staged content == reviewed content, verdict PASS?
  │           post-commit ─► check.mjs record   approve the commit (patch-id) if pre-commit passed
  ▼
git push / gh pr create ─► pre-push ─► check.mjs push   every outgoing commit approved?
gh pr merge (instruction in AGENTS.md) ─► check.mjs pr-merge
```

- **The review scope is uncommitted changes** (staged + unstaged + untracked). The hook runs at
  commit time, so every commit is reviewed before it exists. At PR time only the verification is left.
- **Routing** (`routing.json`): each skill has globs, optional content triggers (`contains`) and a
  mode. `gating` skills can block. `advisory` skills are capped at WARNING. A skill that is installed
  but has no route is reported, and `lib.test.mjs` fails, so the table cannot fall behind silently.
- **Deterministic checks** run inside `verdict.mjs`, not by the agent. `tsc --noEmit` runs per touched
  package. dependency-cruiser runs against a baseline from `HEAD` in a throwaway worktree. Any type
  error or new dependency-rule violation is a CRITICAL. Binaries are called directly (never
  `pnpm exec`, which can trigger an install).
- **Staleness** is detected by content hashes, not by time. Any edit after the review requires a new one.
  Splitting reviewed changes into several commits is fine.
- **Approval survives rebase / amend** because it is keyed by `git patch-id --stable`, which depends
  only on the diff.
- **Hook messages are instructions.** Agents see the hook's stderr in the git output, so even an
  agent that skipped `AGENTS.md` is told to read `SKILL.md` and retry.

| Routed to | Skills |
|---|---|
| `client/**` (UI) | frontend-architecture, react-best-practices, next-best-practices, react-testing-library (tests, advisory) |
| `server/**`, `reviewer-core/**` (backend) | onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design |
| both | security (gating), zod and typescript-expert (advisory) |
| not reviewed | `**/*.md`, `.claude/**`, `.githooks/**`, lockfiles, `server/clones/**`, `client/src/vendor/ui/**` |

## Setup (once per clone)

```sh
git config core.hooksPath .githooks     # ./scripts/dev.sh does this for you
```

Without it, only the `AGENTS.md` instruction protects the clone. `verdict.mjs` reminds you.

Branch commits made **before** the hooks were enabled are not approved, so pre-push blocks them. A
human approves them once:

```sh
node .claude/skills/pr-self-review/scripts/check.mjs approve-existing   # vs origin/main; logged
```

## Escape hatch (humans only)

```sh
PR_SELF_REVIEW_SKIP=1 git commit …    # or git push …
```

Logged to `.git/pr-self-review/skipped.log`. A skipped commit is never approved, so pushing it
needs the variable again. Explain the skip in the PR. Agents are told never to use it.

## Limits

- **`gh pr merge` is not a git operation**, so no git hook sees it. Only the `AGENTS.md` instruction
  (`check.mjs pr-merge`) covers it. If every clone has the hooks, only reviewed commits reach the
  remote, so a merge is effectively safe. A hard merge block needs a GitHub required status check,
  which is not part of this skill.
- `--no-verify` on a commit is caught by pre-push. `--no-verify` on the push too bypasses everything.
- A conflict resolution during a rebase changes the patch, so pre-push asks to re-review those commits
  (`git reset --soft <sha>~1`, review, commit).
- `git commit --amend` with no staged changes re-approves the amended commit. If that commit was
  made with `--no-verify`, the approval is wrong. This is a known edge case.
- Humans cannot commit reviewable files without running the review through an agent (or the escape hatch).
- The review is an LLM review: CRITICAL rules are written down in `references/findings-schema.md`
  and checked for evidence, but its judgment is not deterministic. The hooks are.

## Files

| Path | Role |
|---|---|
| `SKILL.md` | Procedure for the agent |
| `routing.json` | Skill → files, mode, severity map |
| `references/findings-schema.md` | Findings JSON, one severity scale, CRITICAL rules per skill |
| `references/reviewer-prompt.md` | Prompt for one skill bucket (subagent or self-checklist) |
| `scripts/collect.mjs` | Uncommitted changes → plan |
| `scripts/verdict.mjs` | Findings + deterministic checks → verdict, report, marker |
| `scripts/checks.mjs` | `tsc --noEmit` per package, dependency-cruiser vs `HEAD` baseline |
| `scripts/check.mjs` | Hook gate: `commit`, `record`, `push`, `pr-merge`, `approve-existing` |
| `scripts/lib.mjs` | Shared logic: pure decisions + git I/O |
| `scripts/*.test.mjs` | `node --test '.claude/skills/pr-self-review/scripts/*.test.mjs'` (unit + real-git end-to-end) |
| `evals/evals.json` | Behaviour evals for the agent side |
| `/.githooks/*` | `pre-commit`, `post-commit`, `pre-push` → `check.mjs` |

State lives in `.git/pr-self-review/` (`result.json`, `approved`, `pending.json`, `skipped.log`).
It is never committed.

## Adding a skill

Add an entry to `routing.json` (`skill`, `area`, `mode`, `include`, optional `exclude` /
`contains` / `severityMap`), or list it in `ignoreSkills`. Then add its CRITICAL rule to
`references/findings-schema.md` and run the tests.
