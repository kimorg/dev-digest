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

### 2026-10-18 — testing a whole page view in vitest: stub `AppShell` + repo context, pin `now` on the intl provider
**Context:** `ConventionsView.test.tsx`, the first test that renders a full route view. · **Insight:** `AppShell`
pulls in the router, repos and shortcuts. `vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }) =>
<div>{children}</div> }))`, plus a mocked `@/lib/repo-context` (`useActiveRepo`, `useRepoNotFound`) and
`next/navigation` (`useParams`), are enough. `useNow()`/`format.relativeTime` are deterministic once
`<NextIntlClientProvider now={new Date(…)}>` is set ("last scan 1 hour ago"). In CDP checks, a controlled
`<textarea>` only takes a value through the native setter:
`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v)` + `ta.dispatchEvent(new
Event('input', { bubbles: true }))`. Assigning `ta.value` alone gets reverted by React. · **Evidence:**
`client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.test.tsx` · **Apply when:**
testing a page-level view, or typing into a React input from a headless-Chrome script.

### 2026-11-06 — screenshot a dnd-kit drag mid-way with CDP mouse events, then cancel with Escape (no save)
**Context:** checking the context picker's drag visuals against the agent Skills tab. · **Insight:**
for a *visual* check the keyboard flow (Space/ArrowDown/Space) is not needed and it saves on drop. Instead,
send `Input.dispatchMouseEvent` `mousePressed` on the grip, then about 10 `mouseMoved` steps with `buttons: 1`
past the `PointerSensor` 4 px activation distance, then take a screenshot and read the sortable wrappers' inline
`transform`/`zIndex`. A `keyDown` Escape cancels the drag, so the order and the dev DB stay unchanged.
Seeded data: only skill `8fda343c…` ("Breaking Change") has ≥ 2 attached docs; the agents have ≤ 1. ·
**Evidence:** `client/src/components/context-docs-picker/SortableContextDocRow.tsx`,
`client/src/components/context-docs-picker/ContextDocsPicker.tsx` · **Apply when:** verifying how any dnd-kit
list looks during a drag.

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

### 2026-10-14 — "unused" hooks/components are lesson scaffolding — don't delete them as dead code
**Context:** frontend refactor; a consumer count flagged `useContextFiles`/`useReindexContext`,
`lib/hooks/repo-intel.ts` and `components/mermaid-diagram` as having 0 consumers. · **Insight:**
they're pre-wired for later course lessons (README lesson table: L03 Smart Diff, L04 Blast Radius
reads `repo-intel`, L05 Project Context Folder), not dead code. `repo-intel.ts` even names its
future caller (`ProjectContextView`). Keep them, and keep them compiling, when refactoring. ·
**Evidence:** `README.md:82-89`, `client/src/lib/hooks/context.ts`, `client/src/lib/hooks/repo-intel.ts:27` ·
**Apply when:** a cleanup pass wants to delete client code with no consumers.

### 2026-10-14 — the API answers a malformed id with 422, not 404 — both mean "not found" on a GET-by-id
**Context:** `/agents/does-not-exist` showed a retryable error instead of the not-found state. ·
**Insight:** Fastify validates path params first, so a non-uuid id returns
`422 validation_error "Invalid uuid"` before any lookup. A real uuid that doesn't exist returns 404.
`isNotFoundError` treats both as "can't exist" (no retry). Use it only for GET-by-id queries:
on mutations a 422 means an invalid body. · **Evidence:** `client/src/lib/api.ts` (`isNotFoundError`),
`client/src/app/agents/[id]/_components/AgentEditorView/AgentEditorView.tsx` ·
**Apply when:** adding a detail screen whose id comes from the URL.

### 2026-10-14 — run-header verdict labels are a separate lowercase key set on purpose (e2e waits on them)
**Context:** moving `ReviewRunAccordion` strings to i18n. · **Insight:** the accordion header
badge shows `request changes` (lowercase, `prReview.reviewRun.verdictBadge.*`), while the
VerdictBanner shows `Request changes` (`prReview.verdict.*`). Don't merge them: e2e flow 04 waits
for the lowercase `request changes` and for `2 findings`, which the header renders through the
ICU plural `prReview.reviewRun.findings`. · **Evidence:** `e2e/specs/04-pr-findings.flow.json`,
`client/messages/en/prReview.json` (`reviewRun`) · **Apply when:** editing verdict/finding-count
labels on the PR-detail Agent runs tab.

### 2026-10-14 — in a PR-list row only the title is a `<Link>`, not the whole row
**Context:** making PR rows keyboard-accessible. · **Insight:** wrapping the row in `<a>` would
nest the FINDINGS hover cell (focusable, opens a portalled popover) inside an anchor, which is
invalid HTML and lets popover clicks navigate. So the title is a `<Link>` with
`onClick={(e) => e.stopPropagation()}` (the row's own `onClick` would push the same URL again),
and the rest of the row stays a mouse-only convenience. e2e clicks the title text, so this works with it. ·
**Evidence:** `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx` ·
**Apply when:** making any clickable row with interactive cells navigable.

### 2026-10-15 — a polled query's `isError` turns true while its data is still cached — don't let it blank a screen
**Context:** reviewing the refactored `usePrByNumber`. · **Insight:** `usePulls` refetches every 60s and
on window focus. When one refetch fails, TanStack sets `status: "error"` / `isError: true` but keeps
`data`. OR-ing that `isError` into a screen-level error swapped the PR-detail page for a full-screen
`ErrorState`, even though the cached list still resolves number → uuid. Retry then refetched the
detail, not the list, so the error stayed until the next good poll. Treat a polled dependency's
error as blocking only when `data == null`, and retry whichever query is actually blocking. ·
**Evidence:** `client/src/lib/hooks/pulls.ts:50`, `client/src/lib/hooks/pulls.test.tsx` ·
**Apply when:** a composed hook or view merges `isError` from a query that has `refetchInterval` / `refetchOnWindowFocus`.

### 2026-10-17 — "latest run per agent" = latest `reviews` row per `(pr_id, agent_id)`; the rule is duplicated in the client
See `server/INSIGHTS.md` → "\"latest run per agent\" = latest `reviews` row per `(pr_id, agent_id)`; the rule is duplicated in the client".

### 2026-10-17 — `messages/en/skills.json` is pre-written for an obsolete Skills design and nothing reads it
**Context:** writing the L02 Skills spec against the brief and screenshots. · **Insight:** no
component calls `useTranslations("skills")`. The file describes an "Add a skill" **drawer** with
file / URL / community tabs, and its copy makes promises the server does not keep ("Pasted content is
wrapped as untrusted data", "Fetched server-side"). Skills are injected as trusted instructions, not
wrapped. `agents.json` already has the `editor.tabs.skills` and `skills.*` keys for the agent tab. Treat
both as drafts: rewrite the Skills copy for the spec'd design instead of wiring the existing keys
as they are. · **Evidence:** `client/messages/en/skills.json:33`, `client/messages/en/skills.json:48`,
`client/messages/en/agents.json:92`, `client/specs/003-skills.md` · **Apply when:** building any Skills UI.

### 2026-10-17 — skills scaffolding is half-wired: links persist, but no run ever loads them
See `server/INSIGHTS.md` → "skills scaffolding is half-wired: links persist, but no run ever loads them".

### 2026-10-17 — the `Markdown` primitive rendered unstyled: headings and lists came out as plain paragraphs
**Context:** checking the skill Preview tab (requirement: formatted, not raw) in headless Chrome. ·
**Insight:** `Markdown` only overrides `p` / `strong` / `code` / `a` inline, and the base CSS reset
strips list markers and heading sizes. Until `.dd-md` rules existed, `# Title` and `- item`
rendered as same-size text with no bullets, which looked like "not rendered". A `.dd-md` stylesheet
block now restores h1–h4, ul/ol, blockquote, pre, table and hr for every `Markdown` use. ·
**Evidence:** `client/src/vendor/ui/styles.css:295`, `client/src/vendor/ui/primitives/Markdown.tsx:9` ·
**Apply when:** rendering block markdown anywhere (skill bodies, docs), or restyling the reset.

### 2026-10-17 — every mutation error already shows a global toast; add inline errors only for form fields
**Context:** wiring skill create/import/link mutations. · **Insight:** `MutationCache.onError`
in `providers.tsx` toasts *every* failed mutation. A per-mutation `onError: toast.error(…)` shows
the message twice. Leave failures to the global toast, and render only field-level problems inline
(409 name taken, import parse error). Optimistic mutations still need their own `onError`, but only
for the rollback. · **Evidence:** `client/src/lib/providers.tsx:41`,
`client/src/lib/hooks/agents.ts` (`useSetAgentSkills`) · **Apply when:** adding a mutation or form.

### 2026-10-17 — the kit `Modal` is not portalled: inside a disabled card it inherits the card's opacity
**Context:** replacing `window.confirm` in `AgentCard` with a dialog. · **Insight:** `Modal` is a
`position: fixed` child rendered in place, so any ancestor `opacity` (disabled cards use 0.6) or
`transform` applies to it. `ConfirmDialog` therefore `createPortal`s to `<body>`. React synthetic
events still bubble through a portal to the React parent, so an owner that sits inside a clickable
card must keep a `stopPropagation` wrapper around the dialog, or confirming also opens the card. ·
**Evidence:** `client/src/components/confirm-dialog/ConfirmDialog.tsx:45`,
`client/src/app/agents/_components/AgentCard/styles.ts:11` · **Apply when:** opening a Modal
from inside a card, row or anything with opacity/transform.

### 2026-10-17 — `messages/en/skills.json` was rewritten and is now read
**Context:** implementing `client/specs/003-skills.md`. · **Insight:** Supersedes:
"`messages/en/skills.json` is pre-written for an obsolete Skills design and nothing reads it". The
file now matches the shipped design (Create / From file modal, Config / Preview / Versions) and is
the `skills` namespace of `src/app/skills/**` and of the agent Skills tab (type labels). ·
**Evidence:** `client/messages/en/skills.json` · **Apply when:** adding Skills UI copy.

### 2026-10-18 — the trace Skills block hides the `<skill>`/`Description:` wrapper with a regex tied to the server format
**Context:** removing the skill name/description lines from Prompt assembly → Skills (dynamic). ·
**Insight:** `prompt_assembly.skills` is the exact text the LLM got. The wrapper is hidden only
on the client (`stripSkillHeaders`), and the text it strips is also what copy and fullscreen use.
The regex matches the line format of server `renderSkillBlock`. If that format changes, the strip
quietly stops matching and the wrapper lines show again. No test catches it, because the client
test builds its own fixture. The header token count (`tokens.skills`) still counts the wrapper. ·
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts:22`,
`server/src/modules/reviews/helpers.ts:102` · **Apply when:** changing `renderSkillBlock` or the
trace Skills block.

### 2026-10-28 — sticky elements inside a PR tab must sit below `PrDetailHeader`: use `top: var(--pr-header-h)`
**Context:** Smart Diff group headers (`position: sticky; top: 0`) looked fine in jsdom but disappeared on
scroll. · **Insight:** `PrDetailHeader` is itself `sticky; top: 0; zIndex: 5` in the same `<main>` scroller,
and its height varies (the title wraps), so any `top: 0` sticky child in tab content slides underneath it.
`usePublishHeight` (ResizeObserver) now writes the header height to `--pr-header-h` on the scroller; use
`top: "var(--pr-header-h, 0px)"` and a zIndex below 5. Checked by scrolling `<main>` via CDP: the group
header's top went from 52 px (hidden) to 228 px (just under the tabs). · **Evidence:**
`client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/styles.ts:5`,
`…/PrDetailHeader/hooks/usePublishHeight.ts`, `…/DiffTab/_components/RoleGroup/styles.ts` · **Apply when:**
adding any sticky header/toolbar inside a PR-detail tab.

### 2026-10-28 — findings refresh on every drop in live runs, not on RunStatus `onDone`
**Context:** Smart Diff needed findings to update on the Files changed tab after Run review. · **Insight:**
`RunStatus` (the only SSE "run settled" signal) is mounted only inside FindingsTab, so other tabs never
heard about finished runs. `useRefreshOnRunsSettled(liveRunIds.length, refreshRuns)` in `PrDetailView` is
now the single owner (the `onRunDone` wiring was removed). It must fire on **every decrease** of the
live-run count: a first version fired only on >0 → 0, so with "Run all" no agent's findings appeared
until the last agent finished. The refresh now follows the 4 s `usePrActiveRuns` poll instead of SSE. ·
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailView/hooks/useRefreshOnRunsSettled.ts`,
`…/PrDetailView/PrDetailView.tsx:51`, `…/RunStatus/RunStatus.tsx:30` · **Apply when:** anything on the PR
page must react to a review run finishing.

### 2026-11-06 — optimistic full-list saves need `scope` + "only the newest save writes the cache"
**Context:** self-review finding on `useSetContextPaths`. · **Insight:** each toggle PUTs the whole list, so
quick toggles overlap. The old response's `onSuccess` overwrote the newer optimistic list, and the next toggle
was then built from that stale list. The PUTs could also reach the server out of order. TanStack v5
`scope: { id }` runs `onMutate` at once but sends the requests one at a time, in order. In `onSuccess` /
`onError`, write or roll back only when `qc.isMutating({ mutationKey, exact: true }) === 1` (the running save
counts itself). A hook test with hand-resolved PUTs shows it. `useSetAgentSkills`
(`client/src/lib/hooks/agents.ts:108`) still has the old pattern. · **Evidence:**
`client/src/lib/hooks/context.ts` (`useSetContextPaths`), `client/src/lib/hooks/context.test.tsx` ·
**Apply when:** writing any optimistic mutation that sends the full list.

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

### 2026-10-14 — clicking a Next `<Link>` in vitest logs "Error: Not implemented: navigation"
**Context:** testing that the PR title link doesn't double-navigate. · **Insight:** outside the
App Router context, `next/link` falls back to a native anchor click, and jsdom prints
`Not implemented: navigation (except hash changes)`. The test still passes, but the noise hides real
errors. Add `link.addEventListener("click", (e) => e.preventDefault())` before `fireEvent.click`;
React's own `onClick` still runs. · **Evidence:**
`client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx` ·
**Apply when:** a component test clicks a `next/link` link.

### 2026-10-15 — `renderHook`: after `act(() => qc.refetchQueries(…))` `result.current` can still be stale — the assertion passes vacuously
**Context:** writing a regression test for a failed background refetch. · **Insight:** right after
`await act(() => qc.refetchQueries(...))`, the query cache already reported `status: "error"`, but the
hook's rendered output hadn't caught up. So `expect(result.current.isError).toBe(false)` passed
against the **buggy** code too. Fix: return the underlying query from the same test hook
(`{ ...usePrByNumber(...), list: usePulls(...) }`), `waitFor` its rendered state
(`list.isError === true`), then assert. Always check that a regression test fails on the old code. ·
**Evidence:** `client/src/lib/hooks/pulls.test.tsx:20`, `client/src/lib/hooks/pulls.test.tsx:45` ·
**Apply when:** testing hook state that follows a manual `refetchQueries` / `invalidateQueries`.

### 2026-10-17 — dnd-kit drag & drop can't run in jsdom; verify it with CDP key events in real Chrome
**Context:** testing the agent Skills tab reorder. · **Insight:** dnd-kit measures rows with
`getBoundingClientRect`, which is all zeros in jsdom, so a keyboard or pointer drag in vitest moves
nothing. Unit-test the pure reorder helper (`moveLink`) and the rendered state (grip only on linked
rows, disabled while filtering) instead. For the real check: run headless Chrome with
`--remote-debugging-port`, focus the grip button, and send `Input.dispatchKeyEvent` for
Space → ArrowDown → Space with `windowsVirtualKeyCode` 32/40/32. The rows swap and
`POST /agents/:id/skills` fires. Restore the order afterwards, because it writes to the dev DB. ·
**Evidence:** `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:46`,
`…/SkillsTab/helpers.test.ts` · **Apply when:** changing any dnd-kit list.

### 2026-10-18 — native `<select>` popups follow `color-scheme`, not the theme tokens
**Context:** the `SelectInput` dropdown opened white in dark theme. · **Insight:** the browser
draws the open option list as a native popup. CSS variables on `[data-theme]` don't reach it, and
`SelectInput`'s `<select>` is `background: transparent`, so options had no dark surface and inherited
the light `--text-primary` text (light grey on white). The fix is global in `styles.css`:
`color-scheme: dark|light` in each theme block, plus an `option { background; color }` rule. Checked in
headless Chrome via CDP `getComputedStyle`. Note that a screenshot can't capture the open native popup. ·
**Evidence:** `client/src/vendor/ui/styles.css:12`, `client/src/vendor/ui/styles.css:203`,
`client/src/vendor/ui/kit/SelectInput.tsx:36` · **Apply when:** any native control (select, date
picker, scrollbar) looks light in dark theme, or when adding a new theme.

### 2026-10-18 — an `Icon.*` inside running text breaks onto its own line: Tailwind's preflight makes `svg` a block
**Context:** adding an external-link icon after the evidence path inside a `MonoLink`. · **Insight:**
`vendor/ui/styles.css` does `@import "tailwindcss"`. Tailwind's preflight sets `svg { display: block }`, so a lucide icon
placed inside inline text (a link, a span) wraps under the text in the real browser. vitest/jsdom doesn't
lay out, so tests can't catch it. Give the icon `style={{ display: "inline-block", verticalAlign: "-1px" }}`,
or put text and icon in an `inline-flex` container. Verified with a headless-Chrome screenshot. ·
**Evidence:** `client/src/app/repos/[repoId]/conventions/_components/ConventionCard/styles.ts` (`linkIcon`),
`client/src/app/globals.css:2` · **Apply when:** putting an icon inline with text outside a flex container.

### 2026-10-28 — `@testing-library/user-event` is not installed: component tests use `fireEvent`
**Context:** plan 002, IntentCard tests (the RTL skill and the plan asked for `userEvent`). · **Insight:**
`client/package.json` has no `@testing-library/user-event`, and ~30 existing test files use
`fireEvent`. Importing `userEvent` fails module resolution. Use `fireEvent` unless the user approves
adding the dependency. · **Evidence:** `client/package.json`,
`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.test.tsx` ·
**Apply when:** writing a client component test or a plan that prescribes `userEvent`.

### 2026-11-03 — the kit `Modal` does not close on Esc: the caller handles the key
**Context:** plan 005 S10, the Blast radius graph modal. · **Insight:** `vendor/ui/kit/Modal.tsx` has no
`keydown` handling (only its own "Close" button, `aria-label="Close"`), so "close on Esc" must be added by the
component that opens it. Restoring focus is also the caller's job: keep `e.currentTarget` from the trigger click
and focus it on close. · **Evidence:** `client/src/vendor/ui/kit/Modal.tsx`,
`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/_components/BlastGraphModal/BlastGraphModal.tsx:22` ·
**Apply when:** opening any kit `Modal` that should be keyboard-dismissable.

### 2026-11-03 — in jsdom a `<wbr>` inside a link adds a space to its accessible name
**Context:** wrapping long `file:line` caller paths in the Blast radius card with `<wbr>` after each `/`. ·
**Insight:** `getByRole("link", { name: "src/a.ts:7" })` stopped matching: Testing Library computes the
name of `<a>src/<wbr />a.ts:7</a>` as `"src/ a.ts:7"` (checked with `logRoles`), since jsdom has no layout and
treats `<wbr>` as non-inline. Browsers treat `<wbr>` as inline, so the real name has no space. Match such links
with a function that drops whitespace: `{ name: (n) => n.replace(/\s+/g, "") === path }`. Don't switch to
zero-width spaces: they end up in copied text. · **Evidence:**
`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/_components/BlastSymbolItem/BlastSymbolItem.tsx`
(`pathSegments` + `<wbr />`), `.../BlastSymbolItem/BlastSymbolItem.test.tsx` (`pathName`) · **Apply when:**
adding break opportunities to text inside a link or button you query by accessible name.

### 2026-11-03 — a fixed-size canvas in the kit `Modal` gets a horizontal scrollbar unless the modal width is derived from it
**Context:** the Blast radius graph modal showed a scrollbar even for a 2-node graph. · **Insight:** the kit
`Modal` body has no padding and `overflow: auto`, and `width` is border-box with a 1px border. The graph canvas
(1032 px) plus its 8 px scroll padding was 1048 px inside `width={1040}`, so it always scrolled. Compute the
width from the content: `canvas + 2 × scroll padding + 2` (`graphModalWidth`). `maxWidth: 100%` still lets it
scroll on narrow viewports. · **Evidence:** `client/src/vendor/ui/kit/Modal.tsx:28-60`,
`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/_components/BlastGraphModal/graph-layout.ts`
(`graphModalWidth`) · **Apply when:** putting fixed-width content (canvas, SVG, table) into a kit `Modal`.

### 2026-11-06 — the kit `IconBtn` takes a closed prop set and never forwards a `ref`
**Context:** plan 006 S12/S13, returning focus inside the preview panel and the spec-ref modal. · **Insight:**
`IconBtn` destructures only `icon/label/size/active/onClick/danger` and renders its own `<button>`, so a `ref`
passed to it (React 19 treats `ref` as a prop) is dropped and `ref.current` stays `null`. To focus inside a panel,
put `tabIndex={-1}` and the ref on the panel container and focus that. · **Evidence:**
`client/src/vendor/ui/primitives/IconBtn.tsx:4-18`, `client/src/components/context-docs-picker/ContextPreviewPanel.tsx:34` ·
**Apply when:** managing focus around a kit `IconBtn` (including close buttons in panels).

### 2026-11-06 — jsdom's `Blob` has no `.text()`: read a downloaded Blob with `FileReader`
**Context:** plan 006 T-34, asserting the Download content passed to `URL.createObjectURL`. · **Insight:** in the
vitest jsdom env `blob.text()` is not a function; wrap `FileReader.readAsText` in a promise instead. · **Evidence:**
`client/src/app/repos/[repoId]/context/_components/ContextDocPreview/ContextDocPreview.test.tsx:61` · **Apply when:**
testing any Blob/file download.

### 2026-11-06 — a `messages/en/*.json` with an array fails typecheck as `NextIntlClientProvider` messages
**Context:** plan 006 context tests (`context.json` has `empty.patterns: [...]`). · **Insight:** the inferred JSON
type with an array is not assignable to `AbstractIntlMessages`, so `pnpm typecheck` fails in the test; cast it
(`contextJson as unknown as AbstractIntlMessages`). · **Evidence:**
`client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.test.tsx:28` · **Apply when:**
a message file gains an array and is passed to a test provider.

### 2026-11-06 — `RunTraceDrawer` is itself `role=dialog`: pick a modal opened inside it with `getAllByRole("dialog").at(-1)`
**Context:** plan 006 T-42, the spec-ref full-text modal inside the trace drawer. · **Insight:** `getByRole("dialog")`
finds two dialogs and throws; the inner modal is the last one in document order. · **Evidence:**
`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:139` · **Apply when:**
testing any `Modal` opened from the trace drawer.

### 2026-11-06 — `ProjectContextView` renders its pane test ids while loading: wait for loaded content before querying inside them
**Context:** plan 007 tests for the Project Context page. · **Insight:** `context-docs-pane` and
`context-preview-pane` are rendered by the loading branch too (skeleton, `aria-busy="true"`), so
`findByTestId` resolves before the data arrives and `within(pane)` queries fail. Two first-draft
tests failed this way. Await a piece of loaded content (a row path) first. · **Evidence:**
`client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx:59,68` (loading)
vs `:97,106` (loaded) · **Apply when:** testing any state of the Project Context page.

### 2026-11-06 — jsdom counts a `hidden` tooltip in the accessible description via `aria-describedby`
**Context:** plan 007 T-4, the Rescan tooltip. · **Insight:** an element with `hidden` that
`aria-describedby` points to still counts in jsdom's accessible-description computation, so
`toHaveAccessibleDescription(text)` passes while the tooltip is closed. A visually-hidden style
is not needed for the assertion. · **Evidence:**
`client/src/app/repos/[repoId]/context/_components/ContextDocToolbar/ContextDocToolbar.tsx:50,53`,
`ContextDocToolbar.test.tsx:69` · **Apply when:** asserting a hover/focus tooltip that toggles `hidden`.

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

### 2026-10-17 — after adding a route, `tsc` fails: "Type '"/skills"' does not satisfy the constraint 'AppRoutes'"
**Context:** adding `src/app/skills/page.tsx` and `src/app/skills/[id]/page.tsx`. · **Insight:**
`tsconfig` includes Next's generated `.next/types/**`. `validator.ts` lists every route page, but
the `AppRoutes` union is stale until Next regenerates it, so `pnpm typecheck` fails with
`error TS2344` until then. Run `pnpm exec next typegen` (no dev server or build needed), then
typecheck again. · **Evidence:** `client/.next/types/validator.ts` · **Apply when:** adding,
renaming or deleting a `page.tsx`.

### 2026-11-03 — a card test crashes after a sibling query is added: the fetch mock answers every URL with one body
**Context:** plan 005 S12, adding `PriorPrsBlock` (`/pulls/:id/history`) inside `BlastRadiusCard`. · **Insight:**
the card tests mocked `fetch` with one fixed JSON body, so the new `/history` query received a `BlastRadius`
object and the block crashed reading its fields. When a component tree issues more than one query, route the
mock by URL (`url.endsWith("/history") ? json(HISTORY) : json(body)`). · **Evidence:**
`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/BlastRadiusCard.test.tsx:45` ·
**Apply when:** adding a data hook to a child of an already-tested component.

## Session Notes

_One dated line per session that added entries: `- YYYY-MM-DD — task: titles added`._

- 2026-10-09 — Run Cost Badge: a shared component's i18n namespace must be added to every parent's test provider, persisted run traces are never re-parsed (pointer)

- 2026-10-11 — Findings by severity (counts, popover, pills): popovers over the PR table / run accordions: portal to body + stop bubbling at the wrapper, headless `google-chrome` + a CDP script works for visual checks; PR list needs `?status=all`, "Updating a style property during rerender … borderColor borderLeftColor"

- 2026-10-12 — PR-list FINDINGS hover popover + latest review: hover popovers: check them in Chrome with CDP `Input.dispatchMouseEvent`, walking across the gap

- 2026-10-14 — frontend architecture refactor (phases 0–6): "unused" hooks/components are lesson scaffolding — don't delete them as dead code, the API answers a malformed id with 422, not 404 — both mean "not found" on a GET-by-id, run-header verdict labels are a separate lowercase key set on purpose (e2e waits on them), in a PR-list row only the title is a `<Link>`, not the whole row, clicking a Next `<Link>` in vitest logs "Error: Not implemented: navigation"

- 2026-10-15 — review of the frontend refactor (fix usePrByNumber, test i18n): a polled query's `isError` turns true while its data is still cached — don't let it blank a screen, `renderHook`: after `act(() => qc.refetchQueries(…))` `result.current` can still be stale — the assertion passes vacuously

- 2026-10-17 — PR-list FINDINGS per agent: "latest run per agent" = latest `reviews` row per `(pr_id, agent_id)`; the rule is duplicated in the client (pointer)
- 2026-10-17 — L02 Skills spec: `messages/en/skills.json` is pre-written for an obsolete Skills design and nothing reads it, skills scaffolding is half-wired (pointer)
- 2026-10-17 — L02 Skills client implementation: the `Markdown` primitive rendered unstyled: headings and lists came out as plain paragraphs, every mutation error already shows a global toast; add inline errors only for form fields, the kit `Modal` is not portalled: inside a disabled card it inherits the card's opacity, `messages/en/skills.json` was rewritten and is now read, dnd-kit drag & drop can't run in jsdom; verify it with CDP key events in real Chrome, after adding a route, `tsc` fails: "Type '"/skills"' does not satisfy the constraint 'AppRoutes'"
- 2026-10-18 — trace Prompt assembly: tokens only on Skills, hide skill wrapper: the trace Skills block hides the `<skill>`/`Description:` wrapper with a regex tied to the server format
- 2026-10-18 — dark select dropdown: native `<select>` popups follow `color-scheme`, not the theme tokens
- 2026-10-18 — L02 Conventions page: testing a whole page view in vitest: stub `AppShell` + repo context, pin `now` on the intl provider
- 2026-10-18 — Conventions evidence → GitHub link: an `Icon.*` inside running text breaks onto its own line: Tailwind's preflight makes `svg` a block
- 2026-10-28 — plan 002 Intent Layer: `@testing-library/user-event` is not installed: component tests use `fireEvent`
- 2026-10-28 — plan 003 Smart Diff: sticky elements inside a PR tab must sit below `PrDetailHeader`: use `top: var(--pr-header-h)`, findings refresh on every drop in live runs, not on RunStatus `onDone`
- 2026-11-03 — plan 005 Blast Radius: the kit `Modal` does not close on Esc: the caller handles the key, a card test crashes after a sibling query is added: the fetch mock answers every URL with one body
- 2026-11-03 — Overview width + wrapping caller paths + empty Prior PRs: in jsdom a `<wbr>` inside a link adds a space to its accessible name
- 2026-11-03 — Blast graph modal: no scrollbar, file names only: a fixed-size canvas in the kit `Modal` gets a horizontal scrollbar unless the modal width is derived from it
- 2026-11-06 — plan 006 Project Context (/run-plan): the kit `IconBtn` never forwards a `ref`, jsdom `Blob` has no `.text()`, a messages JSON with an array fails typecheck as `NextIntlClientProvider` messages, `RunTraceDrawer` is itself `role=dialog`
- 2026-11-06 — plan 007 Project Context design (/run-plan): `ProjectContextView` renders its pane test ids while loading, jsdom counts a `hidden` tooltip in the accessible description
- 2026-11-06 — context picker drag like the Skills tab: screenshot a dnd-kit drag mid-way with CDP mouse events, then cancel with Escape (no save)
- 2026-11-06 — self-review fixes (context saves): optimistic full-list saves need `scope` + "only the newest save writes the cache"

## Open Questions

_Still unresolved — what is known, what isn't, where to look next._

### 2026-11-06 — Rescan tooltip while rescanning: hover-only, because `Button loading` disables it
**Context:** plan 007, EC-25. · **Insight (unverified in a browser):** `Button`'s `loading` prop
disables the button, so it can't take focus during a rescan and the hint shows only on hover — if
a browser even fires hover events on a disabled button. · **Evidence:**
`client/src/app/repos/[repoId]/context/_components/ContextDocToolbar/ContextDocToolbar.tsx:48` ·
**Next:** check with manual V-7 (CDP hover on the disabled button in Chrome).
