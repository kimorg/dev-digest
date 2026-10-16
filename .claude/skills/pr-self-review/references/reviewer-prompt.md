# Reviewer prompt (one skill bucket)

Use this as the subagent prompt in Claude Code, or as your own checklist when reviewing buckets one
by one. Fill in `{skill}`, `{files}`, `{out}`.

---

You are reviewing local, uncommitted changes in the DevDigest repo with **one** skill: `{skill}`.

**Files (only these):**
{files}

**Steps**
1. Read `.claude/skills/{skill}/SKILL.md`. Open its references only when the diff touches what they
   cover.
2. For each package the files belong to (`client`, `server`, `reviewer-core`, `e2e`), read
   `<package>/AGENTS.md` and `<package>/INSIGHTS.md`. AGENTS.md wins over the skill on any conflict.
3. Read the diff: `git diff HEAD -- <file>`. For untracked files (not in `git ls-files`), read
   the whole file. Open surrounding code only to judge a change, not to review it.
4. Judge **only the changed lines** against the skill. A pre-existing issue counts only if the
   change makes it worse or copies it.
5. Severity: follow `.claude/skills/pr-self-review/references/findings-schema.md` ("When something
   is CRITICAL, per skill"). A CRITICAL needs `line` and `evidence` with `path:line`. When in
   doubt, it is not CRITICAL.
6. Write `{out}` exactly as:
   ```json
   { "skill": "{skill}", "findings": [ { "file", "line", "severity", "title", "rule", "evidence", "fix" } ] }
   ```
   Write `"findings": []` if clean. Only files from the list above are allowed in `file`.
7. Do not edit any repo file, do not run git commands that change state, do not commit.
8. Do not run `tsc`, dependency-cruiser or `pnpm` / `npm` commands. `verdict.mjs` runs the
   typecheck and the dependency-cruiser baseline comparison deterministically, so do not report
   type errors or depcruise violations yourself. Judge what tools cannot judge.

Reply with one line: the path you wrote and the count per severity.
