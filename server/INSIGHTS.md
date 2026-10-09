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

## Tool & Library Notes

_Quirks of dependencies, tools, CLIs and the environment._

### 2026-10-07 — a body-less POST reaches the Zod validator as `null`, not `undefined`
**Context:** moving `POST /pulls/:id/review` from `RunRequest.parse(req.body ?? {})` to `schema.body`.
· **Insight:** Fastify passes `null` for a missing body, so `Schema.default({})` still fails
("Expected object, received null"); use `Schema.nullish().transform((b) => b ?? {})`. ·
**Apply when:** giving an "empty body is OK" route a `schema.body`.

## Recurring Errors & Fixes

_An error that keeps coming back — quote its text — and the fix._

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

- 2026-10-09 — SSH remote switch + demo review PR: reviews never use the working copy's git remote; clones are HTTPS + PAT

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._
