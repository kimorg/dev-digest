# e2e — insights

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

### 2026-10-28 — reproduce CI e2e failures on a prod build with a stderr-logging wrapper
**Context:** PR #7 e2e failed in CI with only `Command failed: agent-browser …` in the log. ·
**Insight:** `run.ts` swallows agent-browser's stderr, so point `AGENT_BROWSER_BIN` at a wrapper
script that appends `$*`, exit code and output to a log — the real reason ("No element found…",
"Names seen: …") is there. `scripts/e2e.sh` runs `next dev`, whose on-demand compiles produce
different races than CI's `next build && next start`; to match CI, copy `client/` (minus
`node_modules`/`.next`, with `node_modules` symlinked) to a scratch dir and build there, so the
dev server's `.next` is untouched. CI also uploads `e2e-failure` screenshots
(`gh run download <id>`). · **Evidence:** `e2e/run.ts:44`, `scripts/e2e.sh:69`,
`.github/workflows/e2e-web.yml:122` · **Apply when:** an e2e step fails in CI and the log says
only "Command failed".

## What Doesn't Work

_Dead ends and anti-patterns — what was tried and why it failed. The most skipped section, and the most valuable._

## Codebase Patterns

_Conventions and architectural decisions (with the reason) that the code doesn't explain._

### 2026-10-28 — flow 09 count is linked of ALL workspace skills, tied to the seed size
**Context:** flow 09 expected "3 of 3 enabled" and failed. · **Insight:** the agent Skills tab
renders `{linked} of {total} enabled` where `total` is every skill in the workspace, not the
agent's linked ones. The seed now has 7 skills (`976090b` added four for API Contract Reviewer),
so the Test Quality Reviewer shows "3 of 7 enabled"; `client/specs/003-skills.md:140` still says
"3 of 3". · **Evidence:**
`client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:93`,
`server/src/db/seed-skills.ts` · **Apply when:** adding/removing seeded skills — update
`specs/09-agent-skills.flow.json` in the same change.

## Tool & Library Notes

_Quirks of dependencies, tools, CLIs and the environment._

## Recurring Errors & Fixes

_An error that keeps coming back — quote its text — and the fix._

### 2026-10-07 — local dev DB usually breaks flow 02; use the hermetic run
**Context:** running flows against a dev stack where you've added your own repos. · **Insight:**
the home redirect lands on the *first* repo, which won't be `acme/payments-api`. `npm run
e2e:hermetic` starts an empty Postgres on alternate ports, so the seed is the only repo. ·
**Apply when:** flow 02 fails locally but passes in CI.

### 2026-10-28 — "No element found" on find…click: `find` does not wait, add `wait --text` first
**Context:** flows 04/05/08/09 failed at `find … click` right after `wait --url` / `networkidle`.
· **Insight:** agent-browser `find role|text … click` checks the DOM once and exits 1
(`✗ No element found: getByRole('button', { name: 'Skills' })`) — it has no auto-wait. `wait
--url` resolves as soon as the router changes the URL, before the client-fetched view renders, and
`networkidle` doesn't cover it either. Precede every `find … click` with a `wait --text` for text
that only exists once the target view is rendered — not the target's own label if it also
appears elsewhere (e.g. "Skills" is in the sidebar, so flow 09 waits for "Configuration"). ·
**Evidence:** `specs/09-agent-skills.flow.json`, `specs/02-repo-pulls-detail.flow.json:7` ·
**Apply when:** adding any click step to a flow.

### 2026-10-28 — "Could not load skills" / "No repo selected" on repeated local runs = API 429
**Context:** re-running `npm test` back-to-back against one API instance. · **Insight:** the API
rate-limits at 120 req/min per client (`server/src/app.ts:99`) and one full suite makes ~80
requests, so a second run within the minute gets 429s and the UI shows error states. Not a CI
issue (one run per fresh API). Wait a minute between local runs or restart the API. · **Evidence:**
`server/src/app.ts:99` · **Apply when:** a flow fails only on the 2nd+ consecutive local run.

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

- 2026-10-28 — fix PR #7 e2e (flows 08/09): reproduce CI e2e failures on a prod build with a stderr-logging wrapper, flow 09 count is linked of ALL workspace skills, "No element found" on find…click, "Could not load skills" / "No repo selected" on repeated local runs = API 429

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._
