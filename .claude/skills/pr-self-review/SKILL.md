---
name: pr-self-review
description: "Self-review of local uncommitted changes before they are committed, pushed or opened as a PR. Routes every changed file to the project skills that cover it (UI skills on client files, backend/architecture skills on server and reviewer-core files), reviews only the changed lines, and records a PASS/BLOCKED verdict that the git hooks in .githooks enforce: any CRITICAL finding blocks commit and push. Use before every git commit, git push, gh pr create or gh pr merge, when a pre-commit or pre-push hook prints 'PR self-review', or when asked to review local changes. Trigger terms: self review, review my changes, before commit, before PR, pre-commit blocked, pre-push blocked, PR self-review."
metadata:
  version: "1.0.0"
  tags: "review, pre-commit, pre-push, pull-request, quality-gate, skills-routing"
---

# PR Self-Review

Reviews **uncommitted changes** (staged + unstaged + untracked) with the project's own skills and
records a verdict. Git hooks (`.githooks/`) refuse `commit` and `push` until the verdict for exactly
those file contents is `PASS`. **Any CRITICAL finding → `BLOCKED`.**

Works with any agent that can read files and run shell commands. Claude-only features (subagents)
are optional speed-ups, never required.

## Hard rules

- Never lower a severity, drop a finding, or edit `.git/pr-self-review/` to get a PASS.
- Never use `git commit --no-verify`, `git push --no-verify` or `PR_SELF_REVIEW_SKIP=1`. These are
  for humans. If the user asks you to skip, say a CRITICAL is open and let them run the command.
- Any edit after the review makes it stale (the hooks compare content hashes). Re-run the whole
  procedure after fixing anything.
- Review the **changed lines**. Report a pre-existing problem only if the change makes it worse.

## Procedure

### 1. Plan

```sh
TMP="$(mktemp -d)"          # any scratch dir outside the repo
node .claude/skills/pr-self-review/scripts/collect.mjs > "$TMP/plan.json"
```

stderr shows the plan: `skill → N files, M lines`. Tell the user the summary and anything under
"no skill covers" or "has no route" (a new skill needs a line in `routing.json`. This is a warning, not a blocker).
If the plan is empty, skip to step 3 with an empty findings dir.

`plan.json` holds `buckets` (skill → files), `bucketLines`, `totalLines` and `files[]` with each
file's package and skills.

### 2. Review each bucket

For **every** skill in `plan.buckets`, produce `$TMP/findings/<skill>.json`. Use
`{ "findings": [] }` when it is clean. A missing file fails the run.

Per bucket, follow [references/reviewer-prompt.md](references/reviewer-prompt.md):
1. Read `.claude/skills/<skill>/SKILL.md`, plus only the references the diff needs.
2. Read the touched package's `AGENTS.md` (it wins on conflicts) and `INSIGHTS.md`.
3. Read the diff of the bucket's files: `git diff HEAD -- <files>`. For untracked files, read the whole file.
4. Write findings in the format of [references/findings-schema.md](references/findings-schema.md).
   Severity rules per skill are there too.

**Do not run `tsc` or dependency-cruiser yourself.** `verdict.mjs` runs them deterministically
(`plan.checks` lists which): `tsc --noEmit` per touched package, and dependency-cruiser against a
baseline from `HEAD` for `server/src` + `reviewer-core/src`. Any type error or **new** dependency-rule
violation is a CRITICAL. Spend your review on what tools cannot judge.

**Execution:**
- **Claude Code:** if `totalLines` > 150 or there are more than 2 buckets, run one subagent per bucket
  in parallel. Give each the filled-in prompt from `reviewer-prompt.md`. Otherwise review inline.
- **Other agents:** go through the buckets one by one. The result is the same.

### 3. Verdict

```sh
node .claude/skills/pr-self-review/scripts/verdict.mjs "$TMP/plan.json" "$TMP/findings"
```

| Exit | Meaning | Do |
|---|---|---|
| 0 | `PASS`, recorded | Show the report and continue with the commit / push / PR |
| 1 | `BLOCKED`, recorded | Show every CRITICAL with its proposed fix. Then see "Who fixes" below |
| 2 | Review broken, nothing recorded | Fix what it lists (missing or invalid findings file, CRITICAL without `path:line`, files changed mid-review) and re-run |

The report's `Checks:` line shows what the deterministic checks did. `NOT RUN` (for example, a
package's deps are not installed) is a WARNING. Tell the user, because type errors are then unchecked.

Show the user the report: the verdict, then CRITICAL → WARNING → SUGGESTION. WARNINGs and
SUGGESTIONs do not block. Mention them.

**Who fixes.** If the change is your own work in the current task, fix the CRITICALs and run the
procedure again from step 1. If it is the user's code and they asked only for a review, a
commit or a push, **do not edit it**. Report the findings with the proposed fixes and ask. Edit only
after they agree, then run the procedure again.

## Before `gh pr merge`

Merging is a GitHub API call, so no git hook sees it. Run:

```sh
node .claude/skills/pr-self-review/scripts/check.mjs pr-merge [<pr-number>]
```

Merge only on exit 0. It requires the PR head to be your reviewed local `HEAD`, with every commit approved.

## When a hook blocks you

The hook's message says why:
- **"no review found" / "not reviewed"** → run this procedure, then retry the same git command.
- **"BLOCKED"** → the listed CRITICALs must be fixed ("Who fixes" above), the procedure run
  again, and then the command retried.
- **pre-push: "commits were not approved"** → follow the printed `git reset --soft <sha>~1` hint
  (the changes stay staged), run the procedure, commit again, push.

## Files

- `routing.json`: skill → globs / content triggers / `gating` or `advisory` / severity map
- `scripts/collect.mjs` · `scripts/verdict.mjs` · `scripts/checks.mjs` (tsc + depcruise) ·
  `scripts/check.mjs` (hook gate) · `scripts/lib.mjs`
- `.githooks/pre-commit|post-commit|pre-push`: enabled with `git config core.hooksPath .githooks`
- How it works, limits and the human escape hatches: [README.md](README.md)
