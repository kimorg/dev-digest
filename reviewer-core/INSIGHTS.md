# reviewer-core — insights

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

### 2026-10-07 — `INJECTION_GUARD` is module-private
**Context:** reading `src/prompt.ts`. · **Insight:** the guard is a non-exported `const`, so it
can't be imported or swapped from outside. The only way in is through `assemblePrompt`, which
appends it on every review path. · **Apply when:** testing injection resistance — assert on the
`assemblePrompt` output, not on the constant.

### 2026-10-18 — `INJECTION_GUARD` is now exported (read-only) for non-review prompts
**Context:** the server's conventions extractor sends repo files to a model. · **Insight:** Supersedes:
"`INJECTION_GUARD` is module-private". It is exported from `src/prompt.ts` and `src/index.ts` so other
prompts that carry untrusted code can append the same guard (with `wrapUntrusted`) instead of copying it.
It stays a `const`, so it still can't be swapped. `assemblePrompt` is unchanged, and review paths append it
as before. · **Evidence:** `reviewer-core/src/prompt.ts:16`, `server/src/modules/conventions/prompt.ts` ·
**Apply when:** building any server prompt that includes repo or PR content.

## Tool & Library Notes

_Quirks of dependencies, tools, CLIs and the environment._

### 2026-10-27 — `npm run typecheck` now covers `reviewer-core/test/**`
Supersedes: "`npm run typecheck` does not cover `reviewer-core/test/**`". See `server/INSIGHTS.md` → "`pnpm typecheck` now covers `server/test/**` via `tsconfig.test.json`".

### 2026-10-27 — the test typecheck compiles `server/src/adapters/mocks.ts` and `git/diff-parser.ts`
**Context:** plan 001, adding `test/**` to the reviewer-core typecheck · **Insight:** `test/run.test.ts`
imports `MockLLMProvider` / `MockGitClient` from `../../server/src/adapters/mocks.js`, so
`npm run typecheck` now type-checks those server files (and `git/diff-parser.ts`) under
reviewer-core's tsconfig, which maps only `zod` and `@devdigest/shared`. A new import in them of
anything else (drizzle, fastify, another server module) breaks the reviewer-core typecheck, not
the server one. The reviewer-core CI workflow lists both files in its `paths` for that reason ·
**Evidence:** `reviewer-core/test/run.test.ts:3`, `reviewer-core/tsconfig.json:21-25`,
`.github/workflows/reviewer-core.yml` (`paths`) · **Apply when:** editing `server/src/adapters/mocks.ts`
or `diff-parser.ts` — run `cd reviewer-core && npm run typecheck` too.

## Recurring Errors & Fixes

_An error that keeps coming back — quote its text — and the fix._

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

- 2026-10-18 — conventions prompt reuses the guard: `INJECTION_GUARD` is now exported (read-only) for non-review prompts
- 2026-10-27 — plan 001 typecheck of tests: `npm run typecheck` now covers `reviewer-core/test/**`, the test typecheck compiles `server/src/adapters/mocks.ts` and `git/diff-parser.ts`

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._
