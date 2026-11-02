# mcp — insights

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

### 2026-11-02 — clipping only title and rationale does not keep `get_findings` under 20 000 chars
**Context:** implementing the response formatter for plan 004 (S4). · **Insight:** with the plan's caps on title
(160) and rationale (300) alone, the worst-case test of 30 maximal findings overflowed the 20 000-char response
budget, because `file` and `category` come unclipped from the PR and the LLM. Every free-text field in a finding
needs its own cap; `FILE_MAX = 80` and `CATEGORY_MAX = 20` made the test pass. · **Evidence:**
`mcp/src/format.ts:100-102`, `mcp/src/constants.ts:22-23`, `mcp/test/format.test.ts:93` · **Apply when:** adding a
field to a tool response, or raising a per-field cap — re-run the worst-case size test.

### 2026-11-02 — asserting an exact fill of the JSON budget fails when rationales contain escapes
**Context:** testing the shared rationale budget in `toReviewResult`. · **Insight:** `clipToJson` never splits an
escape (`\"`, `\\`, `\n` take 2 JSON chars), so each clipped rationale can leave 1 char of its grant unused. A test
with 30 escape-only rationales came out at 19 971 chars, not ">19 990". The bound has to allow 1 char per clipped
field. · **Evidence:** `mcp/src/format.ts` (`clipToJson`), `mcp/test/format.test.ts` ("counts JSON escapes against
the budget") · **Apply when:** writing a lower-bound size assertion for any budget-fitted text.

## Codebase Patterns

_Conventions and architectural decisions (with the reason) that the code doesn't explain._

### 2026-11-02 — rationales share the 20 000-char response budget by severity instead of a 300-char cap
**Context:** the user asked to replace the per-field `RATIONALE_MAX = 300` cap. On PR #8 (8 findings) it cut 761 of
3 100 rationale chars (24.5%) while the whole response used ~5.6k of 20k. · **Insight:** now only metadata (title,
file, category, summary) keeps per-field caps. `toReviewResult` measures the response with empty rationales and the
"shortened" note reserved, then `fitRationales` splits the rest: each rationale first gets up to `RATIONALE_MIN`
(100), so one huge CRITICAL cannot empty the others, then the rest goes out in CRITICAL → WARNING → SUGGESTION
order. Budget units are JSON chars, not `.length`. PR #8 now comes back unclipped. · **Evidence:**
`mcp/src/format.ts` (`fitRationales`, `toReviewResult`), `mcp/src/constants.ts` (`RESPONSE_MAX`, `RATIONALE_MIN`) ·
**Apply when:** adding a field to a finding (it shrinks the rationale budget) or changing the plan-004 caps.

### 2026-11-02 — inside one severity rationales are water-filled, not served in API order
**Context:** the user chose fair share for the open question about one long rationale taking the whole tier. ·
**Insight:** Supersedes: "within one severity the first long rationale takes the budget; fair share not decided".
`fitRationales` now takes `{severity, rationale}` and, in pass 2, runs `waterFill` per severity. Short rationales
stay whole and the long ones get equal shares (±1 JSON char). Severity order is unchanged: a lower severity gets
more than `RATIONALE_MIN` only once every higher one is whole. In the 72-finding stress case, the 19 440-char
CRITICAL went from 10 702 kept to 1 071, and 21 of 23 CRITICAL are now whole (before: the other 22 were cut to 100).
A test that checks "a cut finding ⇒ every later one ≤ min" is wrong now; check that only across severities. ·
**Evidence:** `mcp/src/format.ts` (`waterFill`, `fitRationales`), `mcp/test/format.test.ts` ("splits the budget
evenly inside one severity") · **Apply when:** changing how rationales are budgeted or asserting on cut lengths.

## Tool & Library Notes

_Quirks of dependencies, tools, CLIs and the environment._

### 2026-11-02 — Inspector 2.13.0 resolves `inspector.json`'s relative `command` from the cwd, so run it from `mcp/`
**Context:** adding `scripts/mcp-inspector.sh` (web UI). · **Insight:** run from `mcp/`,
`npx @modelcontextprotocol/inspector@2.13.0 --cli --config inspector.json --server devdigest --method tools/list`
spawns `node_modules/.bin/tsx src/index.ts` and lists all 5 tools (exit 0). This settles plan 004, Risk 7, for the
relative command. The web mode binds `127.0.0.1:6274` plus a sandbox on `127.0.0.1:6275`, prints the URL with
`MCP_INSPECTOR_API_TOKEN`, and opens a browser by itself. · **Evidence:** `scripts/mcp-inspector.sh` (`cd "$ROOT/mcp"`),
`mcp/inspector.json` · **Apply when:** launching Inspector from any other directory — `cd mcp` first or the spawn fails.

## Recurring Errors & Fixes

_An error that keeps coming back — quote its text — and the fix._

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

- 2026-11-02 — L04 devdigest-mcp (plan 004): clipping only title and rationale does not keep `get_findings` under 20 000 chars
- 2026-11-02 — Inspector quick-start script: Inspector 2.13.0 resolves `inspector.json`'s relative `command` from the cwd, so run it from `mcp/`
- 2026-11-02 — severity-prioritized rationale budget: rationales share the 20 000-char response budget by severity instead of a 300-char cap, asserting an exact fill of the JSON budget fails when rationales contain escapes
- 2026-11-02 — fair share within a severity: inside one severity rationales are water-filled, not served in API order

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._

### 2026-11-02 — within one severity the first long rationale takes the budget; fair share not decided
**Context:** stress-checking `fitRationales` with a 72-finding review built from all real review texts. ·
**Insight:** the order inside a severity is the API order. When the first CRITICAL rationale is 19 440 chars, it
keeps 10 702, and the other 22 CRITICAL get only the `RATIONALE_MIN` floor (100). Splitting the budget evenly inside
one severity (water-filling) would spread it out. Unknown: whether the user wants that. No real review has hit the
budget yet: the largest is 8 findings, ~5.6k chars. · **Evidence:** `mcp/src/format.ts` (`fitRationales`, pass 2) ·
**Apply when:** a real review starts returning the "Rationales shortened" note.
