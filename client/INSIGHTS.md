# client — insights

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

### 2026-10-11 — popovers over the PR table / run accordions: portal to body + stop bubbling at the wrapper
**Context:** adding the findings-severity popover to PR rows and timeline rows. · **Insight:**
the PR table and the review-run accordion set `overflow: hidden`, so an absolutely-positioned
popover gets clipped. Use `createPortal(…, document.body)` with `position: fixed` placed from the
trigger's rect. React synthetic events from a portal still bubble through the **React** tree, so
a click inside the popover reaches `PRRow`'s `onClick` (`router.push`). One `stopPropagation`
on the trigger wrapper covers both the trigger and the portalled popover. ·
**Evidence:** `client/src/app/repos/[repoId]/pulls/styles.ts:29`,
`client/src/components/findings-severity/FindingsSeverityCounts.tsx:68`,
`client/src/components/findings-severity/FindingsPopover.tsx:238` ·
**Apply when:** putting any popover/menu inside a clickable row or a clipped container (reuse `FindingsPopover`'s placement code).

### 2026-10-12 — hover popovers: check them in Chrome with CDP `Input.dispatchMouseEvent`, walking across the gap
**Context:** switching the PR-list FINDINGS popover to hover. · **Insight:** the portalled popover
sits 6 px below its trigger. Moving the pointer into it fires `mouseleave` on the cell, so the close
has to be delayed and cancelled by the popover's own `onMouseEnter`. vitest `fireEvent` can't show
that the real pointer path works. In headless Chrome (see the CDP note under Tool & Library Notes),
send `Input.dispatchMouseEvent {type: "mouseMoved"}` to the cell centre, wait more than the open
delay, then step the pointer into the popover's rect in ~6 moves, and check that `[role=dialog]`
is still there. ·
**Evidence:** `client/src/components/findings-severity/FindingsSeverityCounts.tsx:101`,
`client/src/components/findings-severity/FindingsSeverityCounts.tsx:183` ·
**Apply when:** building or changing any hover-triggered popover, tooltip or menu.

## What Doesn't Work

_Dead ends and anti-patterns — what was tried and why it failed. The most skipped section, and the most valuable._

## Codebase Patterns

_Conventions and architectural decisions (with the reason) that the code doesn't explain._

### 2026-10-07 — vendored contracts differ from the server copy
**Context:** comparing `src/vendor/shared` with `server/src/vendor/shared`. · **Insight:**
`adapters.ts` and `contracts/{eval-ci,knowledge,productionize,trace}.ts` differ. The server copy
is the one reviewer-core compiles against. · **Apply when:** a type from `@devdigest/shared`
doesn't match what the API returns — check the server copy before "fixing" the UI.

### 2026-10-09 — a shared component's i18n namespace must be added to every parent's test provider
**Context:** adding `RunCostBadge` (uses `useTranslations("common")`) inside `RunHistory` and
`VerdictBanner`. · **Insight:** component tests build `NextIntlClientProvider` by hand with only
their own namespace (e.g. `{ prReview: messages }`). When a component pulls in a child that reads
another namespace, every test that renders it must add that JSON too
(`{ prReview: messages, common }`), or the child's strings fail to resolve. · **Evidence:**
`client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.test.tsx` ·
**Apply when:** using a `src/components/*` component (or any other namespace) inside a feature component that has tests.

### 2026-10-09 — persisted run traces are never re-parsed, so new `RunTrace` fields must be optional
See `server/INSIGHTS.md` → "persisted run traces are never re-parsed, so new `RunTrace` fields must be optional".

## Tool & Library Notes

_Quirks of dependencies, tools, CLIs and the environment._

### 2026-10-11 — headless `google-chrome` + a CDP script works for visual checks; PR list needs `?status=all`
**Context:** checking the FINDINGS column and popover in the real UI. · **Insight:** the
`agent-browser` CLI used by `e2e/` isn't installed globally, but `/usr/bin/google-chrome` is.
`--headless=new --screenshot=… --virtual-time-budget=10000 <url>` is enough for static shots.
For clicks, start it with `--remote-debugging-port` and drive it from a small Node 22 script
(global `WebSocket`): `Runtime.evaluate` to click, `Page.captureScreenshot`, and listen to
`Runtime.consoleAPICalled` to catch React warnings that never appear in vitest. The PR list
defaults to the `needs_review` filter, so a fully-reviewed repo looks empty without
`?status=all`. · **Evidence:** `client/src/app/repos/[repoId]/pulls/page.tsx:39` ·
**Apply when:** you need to see a UI change, or read browser console errors, against the running dev stack.

## Recurring Errors & Fixes

_An error that keeps coming back — quote its text — and the fix._

### 2026-10-11 — "Updating a style property during rerender … borderColor borderLeftColor"
**Context:** the severity pills reset FindingsPanel's focused card. · **Insight:** `borderColor`
is itself a shorthand for the four sides, so pairing it with `borderLeftColor` triggers React's
shorthand/longhand warning whenever `focused` toggles (j/k navigation too). The fix is to set
`borderTopColor` / `borderRightColor` / `borderBottomColor` separately. The warning only shows
in the browser console, not in vitest. · **Evidence:**
`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:11` ·
**Apply when:** a style object mixes `border*Color`/`border*Width` with a per-side variant whose value changes between renders.

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

- 2026-10-09 — Run Cost Badge: a shared component's i18n namespace must be added to every parent's test provider, persisted run traces are never re-parsed (pointer)

- 2026-10-11 — Findings by severity (counts, popover, pills): popovers over the PR table / run accordions: portal to body + stop bubbling at the wrapper, headless `google-chrome` + a CDP script works for visual checks; PR list needs `?status=all`, "Updating a style property during rerender … borderColor borderLeftColor"

- 2026-10-12 — PR-list FINDINGS hover popover + latest review: hover popovers: check them in Chrome with CDP `Input.dispatchMouseEvent`, walking across the gap

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._
