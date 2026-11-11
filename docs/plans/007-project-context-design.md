# Development Plan: SPEC-005 Project Context — design amendment 2026-11-06 (layout per mockups)
Status: READY · Packages: client · Spec: `specs/005-project-context.md` (AC-8 changed, AC-66…AC-108, EC-21…EC-26, NFR-9)
Execution mode: single-agent

## Changelog / Revision 2
- **AC-108 and EC-26 added** to the Requirements check, the Steps and the manual check V-4: the open preview panel is as tall as the tab content area, whatever the document length.
- **S6 redesigned.**
  - Removed from Revision 1: the sticky panel (`alignSelf: flex-start`, `position: sticky` and the `PREVIEW_PANEL_MAX_HEIGHT` constant). With it the panel was only as tall as its content and needed a magic offset.
  - New layout:
    - On the Context tab, the editor's tab body becomes a non-scrolling, full-height flex container with bottom padding 0, in both `AgentEditor` and `SkillDetail`.
    - The picker fills that body.
    - The list column scrolls on its own.
    - The panel stretches to the full height and scrolls inside.
  - Results: a short document gets a full-height panel; the panel stays in view without sticky; no animation.
- **Decisions taken:** the user accepted the defaults for Q1…Q6 (see "Decisions taken"). No open questions remain.
- **Recommendations R1 and R2 rejected:** the panel keeps `role="dialog"`, the page list keeps `aria-current`.
- **Execution mode fixed:** single-agent.
- **Risks:** the "magic panel height" risk is gone. A new risk: the dnd-kit auto-scroll now happens in the list column.
- **Test IDs** stay the same as in Revision 1. T-12 and T-16 are not used.

## Decisions taken
- D-1 (Q1): the Download button uses `Icon.ArrowDown`, as in 2.png. The kit icon registry is not changed.
- D-2 (Q2): "missing" is a pill with `--warn` text on a `--warn-bg` background, so it differs from the orange `insights` type text.
- D-3 (Q3): the page footer is shown in the empty state (AC-83). It is not shown while loading or on a load error.
- D-4 (Q4, GAP-1): a list load error shows `ErrorState` across the whole area under the title bar, with no toolbar and no footer (like AC-84).
- D-5 (Q5, AC-106): during a drag the dimmed placeholder stays at its original position, and the other rows do not shift.
- D-6 (Q6): the `AgentEditor` layout fix pins the editor's tab row on every agent tab (Config, Skills, Context), as `SkillDetail` already does.
- R1 and R2 rejected: the inline preview panel keeps `role="dialog"`; the selected page-list row uses `aria-current="true"`.

## Requirements check
| ID | Requirement (short) | Status | Proof | Evidence / note |
|---|---|---|---|---|
| AC-8 (changed) | The Rescan hint is the Rescan button's tooltip, not a line under it | OK | test (T-4) | the visible hint line `ProjectContextView.tsx:119` is removed |
| AC-66 | Breadcrumb `owner/name` (mono) › Project Context | OK | test (T-1) | today "Workspace" (`ProjectContextView.tsx:30`); pattern `PullsListView.tsx:58` |
| AC-67 | Title bar shows only "Project Context" | OK | test (T-2) | today heading · repo, subtitle and button (`ProjectContextView.tsx:99-121`) |
| AC-68, AC-69, EC-23 | Two panes: a fixed 300 px pane and the rest; each scrolls on its own; the window does not scroll | OK | manual (V-1) | pattern `height: calc(100vh - 52px)` (`AgentEditorView/styles.ts:5`) |
| AC-70, AC-71, AC-73 | Toolbar: Download, then Rescan; icon-only; Download disabled with no selection | GAP → D-1 | test (T-3) | no `Download` icon in `vendor/ui/icons.tsx:87-167` |
| AC-72 | Tooltip on hover and on focus; it is also the accessible description | GAP | test (T-4) + manual (V-7) | no Tooltip primitive in the kit (`vendor/ui/README.md:29-30`); a native `title` does not show on focus |
| AC-74, AC-75, AC-77, EC-21 | One-line row: icon + full path in mono; ellipsis with the full path in a tooltip; selected state for assistive technology | OK | test (T-6) + manual (V-1) | today a 3-line item (`ContextDocList.tsx:22-36`); `aria-current` already set (`:25`) |
| AC-76 | Selected row: highlight background + accent text | OK | test (T-6) + manual (V-1) | |
| AC-78, AC-80, AC-86 | Header row: path on the left, "Used by" on the right, no Download; no-selection state; 404 text under the header | OK | test (T-7) | `ContextDocPreview.tsx:47-66` |
| AC-79, EC-22 | Wide content scrolls horizontally inside the pane | OK | manual (V-2) | today's overflow comes from grid `1fr` without `minWidth: 0` (`ProjectContextView/styles.ts:26`) |
| AC-81 | Status bar with a dot, full width, pinned to the bottom | OK | manual (V-1); the text is already checked by T-31 | |
| AC-82 | The `truncated` warning sits between the toolbar and the list | OK | test (T-8) | |
| AC-83 | Empty state in the preview pane; Rescan enabled | OK → D-3 | test (T-9) | |
| AC-84 | Not cloned: shown across the whole area, no toolbar, no footer | OK | test (T-10) | |
| AC-85 | While loading: two panes, skeleton rows | OK | test (T-11) | kit `Skeleton` exists |
| GAP-1 | Page load error (the spec is silent) | GAP → D-4 | — | |
| AC-87 | Section spans the full width, no max width | OK | manual (V-3) | `context-docs-picker/styles.ts:5` (`maxWidth: 760`) |
| AC-88…AC-91, AC-107 | First row: title + pill + filter; subtitle with inline code; via-skills line; warning placement | OK | test (T-13, T-14) + manual (V-3, V-4) | today's order differs (`ContextDocsPicker.tsx:92-111`) |
| AC-92, AC-97 | Separate cards; eye icon on Preview | OK | test (T-15) | |
| AC-96 | "missing" in the type slot, warning colour | OK → D-2 | test (T-15) | `insights` also uses `--warn` (`styles.css:29`) |
| AC-93, AC-94, AC-95, EC-24 | One line; handle slot of equal width; type colours | OK | manual (V-3, V-5); element order T-15 | |
| AC-98, AC-100…AC-102 | Inline panel right of the list; checkboxes still toggle; Preview on another row swaps the document; header row with × | OK | test (T-17) + manual (V-4) | today a fixed overlay (`context-docs-picker/styles.ts:92-104`) |
| AC-99, AC-103 | Tabs, header and the agent/skill list column stay visible; the panel stays in view and scrolls on its own | GAP → D-6 | manual (V-4) | on the agent page the whole `AgentEditor`, including the tab row, scrolls (`AgentEditorView/styles.ts:30`, `AgentEditor/styles.ts:5-7`) |
| AC-108, EC-26 | The panel spans the full height of the tab content area, from level with the first section row to the bottom of the window, whatever the document length; a long document scrolls inside; no animation | GAP | manual (V-4) | both tab bodies have `padding: 28` on all sides and `overflow: auto` (`AgentEditor/styles.ts:7`, `SkillDetail/styles.ts:18`), so a child cannot reach the window bottom. jsdom has no layout, so no cheap component test exists |
| AC-104 | Horizontal scroll inside the panel | OK | manual (V-4) | |
| AC-105, AC-106 | Lifted row with an accent border; dimmed placeholder at the original position | OK → D-5 | manual (V-6, CDP) | `verticalListSortingStrategy` shifts rows today (`ContextDocsPicker.tsx:116`) |
| EC-25 | During a rescan the icon spins, the tooltip stays available, Download still works | GAP | test (T-5) + manual (V-7) | a disabled button cannot take focus, so during a rescan the tooltip is reachable by hover only |
| NFR-9 | Structural ACs by component tests, visual ACs by a 1920×1000 screenshot | OK | verify (`cd client && pnpm test`) + manual (V-1…V-7) | |

- Corrections to the spec (verified): none. The code references `ProjectContextView.tsx:96-121`, `ContextDocsPicker.tsx:91-141`, `context.json:43,53` and `PullsListView.tsx:58` match the code.
- Questions: none (all resolved in "Decisions taken").

## Recommendations
- R1 (panel role `complementary`) and R2 (`listbox`/`aria-selected`) were **rejected by the user**. No new recommendations.

## Goal & non-goals (from the spec)
- Goal: the Project Context page and the Context tab follow mockups 2–5 and 8 in markup, placement and visual structure. Texts and behaviour stay as the spec defines them.
- Non-goals:
  - not built: the Preview|Edit toggle, the "+" and "new folder" buttons, the 78% ring, the Evals/CI/Stats tabs;
  - unchanged: the token number format;
  - not required: a pixel-exact match;
  - out of scope: any change in server, reviewer-core, contracts, DB or e2e.
- This plan does not re-plan AC-1…AC-65. `moveAttached`, `toContextRows`, the hooks and the mutations stay unchanged.

## Context consulted
- INSIGHTS — client: 2026-10-17 "dnd-kit drag & drop can't run in jsdom; verify it with CDP key events" → AC-105, AC-106 and the drag regression are proven only in V-6.
- INSIGHTS — client: 2026-10-28 "`@testing-library/user-event` is not installed" → every T row uses `fireEvent`. The repo's INSIGHTS win over the RTL skill's `userEvent` rule.
- INSIGHTS — client: 2026-10-12 "hover popovers: check them in Chrome with CDP `Input.dispatchMouseEvent`" → the Rescan tooltip is checked in V-7.
- Rules:
  - `client/AGENTS.md`: `_components/<Name>/` with its own test; `styles.ts` exports one object `s`, with dynamic styles as functions; UI strings in `messages/en/*.json`; kebab-case `data-testid`; reuse `@devdigest/ui` before writing new primitives.
  - INSIGHTS 2026-10-18: an `Icon` inside running text needs `inline-flex`.
  - INSIGHTS 2026-11-06: `IconBtn` has no `disabled` and drops `ref`, so icon-only buttons use `Button`. `Button` forwards `...rest`, and `loading` disables it and spins its `RefreshCw` icon (`primitives/Button.tsx:69-82`).
  - INSIGHTS 2026-10-18: page-view tests stub `AppShell` and the repo context.

## Architecture
Client only, feature/UI layer.
- New: `app/repos/[repoId]/context/_components/ContextDocToolbar/` with Download, Rescan and a local tooltip. It has one consumer, so it is not promoted to the kit.
- New: `components/context-docs-picker/ContextPickerHeader.tsx` (keeps the picker ≤ 200 lines) and `constants.ts` (type colours, panel width, no-shift sorting strategy).
- Changed editor shells: `AgentEditorView`, `AgentEditor` and `SkillDetail` get a "fill" body for the Context tab (AC-108).
- Import direction:
  - `ContextDocToolbar` → `@/lib/hooks/context` (`useContextFile`; same query key as the preview, so one request) and `@devdigest/ui`;
  - the shared picker imports nothing from `app/`;
  - editors → picker through their `ContextTab`, as today.
- Unchanged: hooks, `api.ts`, contracts. No diagram: one package.

## Skill contract
| File (create/modify) | Skills | Rules the step must satisfy |
|---|---|---|
| `…/context/_components/ContextDocToolbar/{ContextDocToolbar.tsx,index.ts,helpers.ts,styles.ts}` (create; `helpers.ts` moved from ContextDocPreview) | frontend-architecture, react-best-practices, next-best-practices | `"use client"`; icon-only buttons have `aria-label`; tooltip state in local `useState`, no `useEffect`; id from `React.useId()`; strings from i18n; `index.ts` is the one-line redirect |
| `…/ContextDocPreview/{ContextDocPreview.tsx,styles.ts}` (modify); `…/ContextDocPreview/helpers.ts` (delete, moved) | frontend-architecture, react-best-practices | no dead copy after the move; the header is one flex row; `minWidth: 0`; body `overflow: auto` |
| `…/ContextDocList/{ContextDocList.tsx,styles.ts}` (modify) | react-best-practices | key = path; icon inside an `inline-flex` container; ellipsis + `title` |
| `…/ProjectContextView/{ProjectContextView.tsx,styles.ts}` (modify) | frontend-architecture, react-best-practices, next-best-practices | early returns for states; derived values computed in render; ≤ 200 lines; no inline strings |
| `client/messages/en/{context,agents,skills}.json` (modify) | — (AGENTS i18n rules) | nested camelCase keys; a key is removed in the same step that removes its last use |
| `components/context-docs-picker/{ContextDocsPicker.tsx,ContextPickerHeader.tsx (create),ContextDocRow.tsx,SortableContextDocRow.tsx,ContextPreviewPanel.tsx,styles.ts,constants.ts (create)}` | frontend-architecture, react-best-practices | no render factories; SCREAMING_SNAKE constants in `constants.ts`; colours only from CSS variables; ≤ 7 props; no `transition` on the panel |
| `app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx`, `app/skills/_components/SkillDetail/_components/ContextTab/ContextTab.tsx` (modify) | react-best-practices | drop the `hint` prop; keep `data-testid="agent-context-via-skills"` |
| `AgentEditorView/styles.ts`, `AgentEditor/{AgentEditor.tsx,styles.ts}`, `SkillDetail/{SkillDetail.tsx,styles.ts}` (modify) | frontend-architecture, react-best-practices | styles only plus a boolean for the fill body; `s.body(isFill)` as a style function (AGENTS `styles.ts` rule) |
| Tests: `ProjectContextView.test.tsx` (m), `ContextDocToolbar/ContextDocToolbar.test.tsx` (c), `ContextDocPreview.test.tsx` (m), `ContextDocsPicker.test.tsx` (m), both `ContextTab.test.tsx` (m) | react-testing-library | `fireEvent` (INSIGHTS 2026-10-28); queries by role, then text, then testid; mock only fetch via `installFetch`; cast `context.json` to `AbstractIntlMessages` |

## Steps
### S1 — Download and Rescan move to the toolbar; preview header row (2.png)
- Files:
  - create `client/src/app/repos/[repoId]/context/_components/ContextDocToolbar/{ContextDocToolbar.tsx,index.ts,helpers.ts,styles.ts}`;
  - move `baseName` and `downloadText` from `…/ContextDocPreview/helpers.ts` into the toolbar's `helpers.ts` and delete the old file;
  - modify `…/ContextDocPreview/{ContextDocPreview.tsx,styles.ts}`.
- Change:
  - `ContextDocToolbar({ repoId, selected: ContextDocument | null, isRescanning, onRescan })`, wrapper `data-testid="context-doc-toolbar"`.
  - Button 1 (Download):
    - `Button kind="tertiary" icon="ArrowDown"`, with `aria-label` and `title` both `t("doc.download")`;
    - disabled while `!selected` or while there is no `file.data`, where `file = useContextFile(repoId, selected && !selected.too_large ? selected.path : null)`;
    - not affected by `isRescanning`;
    - click → `downloadText(baseName(path), content)`.
  - Button 2 (Rescan):
    - `Button kind="tertiary" icon="RefreshCw" loading={isRescanning} aria-label={t("page.rescan")} aria-describedby={hintId}`, no `title`;
    - wrapped in a `<span>` whose `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` toggle `isHintOpen`;
    - tooltip `<span id={hintId} role="tooltip" hidden={!isHintOpen}>{t("page.rescanHint")}</span>` is always in the DOM, positioned absolutely under the button.
  - Preview pane:
    - remove the Download button;
    - header = one row (path in mono on the left, "Used by" on the right), `data-testid="context-preview-header"`;
    - keep `<section aria-label={doc.path}>` when a document is selected;
    - no selection → only `doc.select`, no header;
    - 404 → `doc.gone` in the body under the header.
- Covers: AC-8, AC-10, AC-70…AC-73, AC-78, AC-80, AC-86, EC-25 · Mockup: 2.png (toolbar icons, preview header row)
- Skills: frontend-architecture, react-best-practices, next-best-practices · Depends on: —
- Done when:
  - the toolbar is exported;
  - the preview has no Download button;
  - `ContextDocPreview/helpers.ts` is gone;
  - no visible hint text is rendered;
  - 2.png elements: two icons in a row (↓ then ⟳); header reads `path … Used by N agents · M skills` on one row.
- Verify: `cd client && pnpm typecheck && pnpm test` (`ContextDocPreview.test.tsx › Download` is expected to fail; it is an assertion change, rewritten by test-writer in T-5 and T-7)

### S2 — One-line rows in the page list (2.png, 3.png)
- Files: modify `…/ContextDocList/{ContextDocList.tsx,styles.ts}`.
- Change:
  - row = `<button title={path} aria-current={isSelected}>` laid out with `inline-flex`;
  - content: `Icon.FileText` + `<span className="mono">` with the full path (`nowrap`, `ellipsis`); no type, no tokens;
  - selected row: `background: var(--bg-hover)` and inline `color: var(--accent-text)`;
  - the list loses its border and `maxHeight`: the pane scrolls.
- Covers: AC-74…AC-77, EC-21 · Mockup: 2.png (`client/docs/ui-architecture.md` selected), 3.png
- Skills: react-best-practices · Depends on: —
- Done when:
  - each row's accessible name is the full path;
  - no type label or `Nt` in the list;
  - 2.png elements: file icon + mono path; blue text on a highlighted background for the selected row.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S3 — Page layout: title bar, two panes, status bar, states (2.png, 3.png)
- Files: modify `…/ProjectContextView/{ProjectContextView.tsx,styles.ts}`, `client/messages/en/context.json`.
- Change:
  - Crumb: `[{ label: repos.find(r => r.id === repoId)?.full_name ?? repoId, mono: true }, { label: t("page.crumbContext") }]`.
  - Root: a column, `height: calc(100vh - 52px)`.
  - Title bar `data-testid="context-title-bar"`: `<h1>{t("title")}</h1>` with a bottom border.
  - Panes row (`flex: 1`, `minHeight: 0`):
    - docs pane `data-testid="context-docs-pane"`: `width: 300`, `flexShrink: 0`, right border, `aria-busy` while loading; contents: toolbar, then the `truncated` warning, then the list with `overflow: auto`;
    - preview pane `data-testid="context-preview-pane"`: `flex: 1`, `minWidth: 0`; its body has `overflow: auto`.
  - Status bar `data-testid="context-status-bar"`: full width, top border; a `<span aria-hidden>` dot, then the footer text in its own `<span>`.
  - States:
    - loading: both panes; the docs pane holds 8 skeleton rows (`<div data-testid="context-doc-skeleton"><Skeleton/></div>`); no footer;
    - error: `ErrorState` across the area under the title bar, no toolbar, no footer (D-4);
    - no_clone: `EmptyState` across the area under the title bar, no toolbar, no footer;
    - empty: toolbar with Rescan enabled, the pattern list in the preview pane, footer shown (D-3).
  - Wiring: `onRescan={() => rescan.mutate()}`, `isRescanning={rescan.isPending}`.
  - i18n: delete `page.crumbWorkspace`, `page.headingPrefix`, `page.repoFallback`, `page.subtitle`, `page.rescanning`.
- Covers: AC-66…AC-69, AC-79, AC-81…AC-85, EC-22, EC-23, GAP-1 · Mockup: 2.png, 3.png
- Skills: frontend-architecture, react-best-practices, next-best-practices · Depends on: S1, S2
- Done when:
  - the view file is ≤ 200 lines;
  - no "Project Context · ", no subtitle and no buttons in the title bar;
  - 2.png elements: `owner/repo › Project Context`; a title bar with a rule under it; a ≈300 px column with the toolbar on top; `● N documents · … tokens total · refreshed …` along the bottom, full width.
- Verify: `cd client && pnpm typecheck && pnpm test` (`ProjectContextView.test.tsx › Rescan` is expected to fail; assertion change, T-4)

### S4 — Section first row, subtitle, via-skills line, warning (4.png, 5.png, 8.png)
- Files:
  - create `client/src/components/context-docs-picker/{ContextPickerHeader.tsx,constants.ts}`;
  - modify `ContextDocsPicker.tsx`, `styles.ts`, both `ContextTab.tsx`, `client/messages/en/{context,agents,skills}.json`;
  - modify `ContextDocsPicker.test.tsx` for compile only: remove `hint="hint text"`.
- Change:
  - remove the picker's `hint` prop;
  - `ContextPickerHeader({ attached, total, tokens, query, onQuery, extra })` renders:
    - a row `data-testid="context-picker-header"`: `<h2>{t("picker.section")}</h2>`, an accent pill (`--accent-bg` background, `--accent-text` text) with `picker.counts`, and on the right a filter input of about 230 px with `Icon.Search` (pattern `SkillsView/styles.ts:17-35`);
    - the subtitle `t.rich("picker.subtitle", { code: (c) => <code className="mono">{c}</code> })`;
    - `extra`, wrapped in a container with the subtitle style;
    - the warning `role="status"` with `Icon.AlertTriangle` in `--warn`;
  - picker root `data-testid="context-docs-picker"`, no `maxWidth`;
  - i18n:
    - replace `picker.hint` with `picker.subtitle` = `"Order matters — earlier docs appear earlier in the assembled <code>## Project context</code> block. Toggle to attach."`;
    - delete `agents.context.hint` and `skills.detail.context.hint`.
- Covers: AC-87…AC-91, AC-107 · Mockup: 4.png, 5.png, 8.png (header row, subtitle with code chip)
- Skills: frontend-architecture, react-best-practices · Depends on: —
- Done when:
  - both tabs render the same subtitle;
  - DOM order: header row → subtitle → extra → warning → list;
  - 4.png elements: `Project context [N of M attached · ~T tokens]` … `🔍 Filter documents…` on one row.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S5 — One-line cards, type colours, eye icon (4.png, 8.png)
- Files: modify `ContextDocRow.tsx`, `styles.ts`, `constants.ts`.
- Change:
  - left to right:
    - handle slot: 16 px, `data-testid="context-doc-handle-slot"`;
    - checkbox;
    - file name: mono, weight 600, ellipsis;
    - folder: mono, `--text-muted`, rendered as `${dir}/` when `dir` is non-empty, ellipsis;
    - at the right edge (`flexShrink: 0`): type, tokens, `Preview` with `Icon.Eye` before the text;
  - `TYPE_COLOR: Record<ContextDocType, string>` = docs `var(--ok)`, insights `var(--warn)`, specs `var(--accent)`, readme `var(--text-muted)`, plans `var(--violet)`; the type is text with no background;
  - "missing" takes the type slot as a `--warn` / `--warn-bg` pill (D-2);
  - card: `--bg-elevated`, gap 8 between cards.
- Covers: AC-92…AC-97, EC-24 · Mockup: 4.png, 8.png
- Skills: react-best-practices · Depends on: S4
- Done when:
  - every row is a single line;
  - `title={path}` is on the text;
  - 4.png elements: `≡ ☑ ui-architecture.md client/docs/ … docs 559t 👁 Preview`, with the docs, insights, specs and readme colours.
- Verify: `cd client && pnpm typecheck && pnpm test` (the `"server"` → `"server/"` assertion is updated in T-15)

### S6 — Full-height inline preview panel; editor layouts (5.png) — revised in Revision 2
- Files:
  - modify `ContextDocsPicker.tsx`, `ContextPreviewPanel.tsx`, `styles.ts`, `constants.ts`;
  - modify `client/src/app/agents/[id]/_components/AgentEditorView/styles.ts`, `client/src/app/agents/[id]/_components/AgentEditor/{AgentEditor.tsx,styles.ts}`, `client/src/app/skills/_components/SkillDetail/{SkillDetail.tsx,styles.ts}`.
- Change:
  - **Editor shells (AC-99, AC-108; D-6):**
    - `AgentEditorView.s.editorBody` → `{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }` (no `overflow`);
    - `AgentEditor.s.wrap` gains `minHeight: 0`;
    - in both `AgentEditor` and `SkillDetail`, `s.body` becomes `s.body(isFill)` with `isFill = tab === "context"`:
      - not fill: unchanged (`flex: 1, overflow: auto, padding: 28`);
      - fill: `{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: "28px 28px 0" }`.
  - **Picker:**
    - root: `{ flex: 1, minHeight: 0, display: "flex" }` (a row; children stretch);
    - list column: `{ flex: 1, minWidth: 0, overflow: "auto", paddingBottom: 28 }`, holding the header and the list;
    - the picker's early-return states (no repo, loading, error, no clone) render as before inside the fill body.
  - **Panel (`ContextPreviewPanel`):**
    - a sibling of the list column, not fixed and not sticky;
    - `{ width: PREVIEW_PANEL_WIDTH (400), flexShrink: 0, alignSelf: "stretch", display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--border)" }`, no `transition`;
    - its header is fixed at the top; its body is `{ flex: 1, minHeight: 0, overflow: "auto" }`;
    - so the panel always spans from the first section row (top padding 28) to the bottom of the window (bottom padding 0), whatever the document length;
    - `role="dialog"`, Esc to close and focus return stay as they are;
    - Preview on another row replaces `previewPath`.
- Covers: AC-98…AC-104, AC-108, EC-26 (AC-26 kept) · Mockup: 5.png
- Skills: frontend-architecture, react-best-practices · Depends on: S4, S5
- Done when:
  - no `position: fixed` / `sticky` and no `maxHeight` in the picker or panel styles;
  - the panel is a child of `context-docs-picker`, next to the list column;
  - the Context tab body has zero bottom padding in both editors;
  - 5.png elements: a narrowed list on the left; a vertical rule; `client/docs/ui-architecture.md ×` at the top of the panel, level with "Project context"; the panel reaching the bottom edge of the window; the first row with the filter at the list column's right edge.
- Verify: `cd client && pnpm typecheck && pnpm test`

### S7 — Drag visuals: lifted overlay with accent border, dimmed placeholder (4.png)
- Files: modify `ContextDocsPicker.tsx`, `SortableContextDocRow.tsx`, `ContextDocRow.tsx`, `styles.ts`, `constants.ts`.
- Change:
  - keep `activeId` in state via `onDragStart` / `onDragEnd` / `onDragCancel`;
  - `<DragOverlay>` renders a `ContextDocRow` for the active row with `isDragging` (border `var(--accent)` and shadow `var(--shadow-modal)`) and a static grip icon;
  - the source sortable item: `opacity: 0.4`, no accent;
  - `SortableContext strategy={NO_SHIFT_STRATEGY}`, where `const NO_SHIFT_STRATEGY: SortingStrategy = () => null`, so the other rows do not shift (D-5);
  - `moveAttached` and the sensors stay unchanged.
- Covers: AC-105, AC-106 (regression of AC-23, AC-56…AC-58) · Mockup: 4.png
- Skills: react-best-practices · Depends on: S5, S6
- Done when:
  - the overlay renders only during a drag;
  - handles appear only on attached rows;
  - 4.png elements: a lifted README.md with a blue border, and a dimmed README.md at its original position.
- Verify: `cd client && pnpm typecheck && pnpm test`

## Cross-cutting
- Contracts: none · DB / migrations: none · Dependencies: none (`DragOverlay` and `SortingStrategy` are exported by the installed `@dnd-kit/core` and `@dnd-kit/sortable`, checked in `node_modules`).
- e2e flows: none. Flow `10-project-context.flow.json` waits for "Project Context" in the sidebar and for "Repository is not cloned yet"; both stay.
- i18n keys:
  - added: `context.picker.subtitle`;
  - removed: `context.page.{crumbWorkspace,headingPrefix,repoFallback,subtitle,rescanning}`, `context.picker.hint`, `agents.context.hint`, `skills.detail.context.hint`;
  - reused: `context.title`, `context.doc.download`, `context.page.rescan`, `context.page.rescanHint`.

## Tests (test-writer)
All tests use `fireEvent`. Fetch is routed by URL with `installFetch`. Documents are built with the existing `doc()` factory.

| T | Proves (AC/EC/NFR) | Pattern → shape | Seam | Kind | File (create/modify) | Observable · fakes | Needs (step) |
|---|---|---|---|---|---|---|---|
| T-1 | AC-66 | Ubiquitous → invariant | ProjectContextView | component | `…/ProjectContextView/ProjectContextView.test.tsx` (m) | the `AppShell` mock captures `crumb` → `[{label:"acme/payments-api",mono:true},{label:"Project Context"}]` | S3 |
| T-2 | AC-67 | Ubiquitous | same | component | same | `context-title-bar` holds only heading level 1 "Project Context" and 0 buttons; neither "payments-api" nor "Markdown documents of the repository…" appears anywhere | S3 |
| T-3 | AC-70, AC-71, AC-73 | Ubiquitous + Unwanted (no selection) | ContextDocToolbar | component | `…/ContextDocToolbar/ContextDocToolbar.test.tsx` (c) | buttons in `context-doc-toolbar` in order [Download, Rescan]; Download has `title="Download"`; `selected=null` → Download disabled; selected + file loaded → enabled | S1 |
| T-4 | AC-8, AC-72, AC-71, AC-9 | Event (hover / focus) + State (pending) | toolbar + view | component | ContextDocToolbar.test (c); ProjectContextView.test (m, replaces the old Rescan test) | see the T-4 steps under the table | S1, S3 |
| T-5 | AC-10, EC-25 | Event; State (rescanning) | toolbar | component | ContextDocToolbar.test (c) | stub `URL.createObjectURL` + `HTMLAnchorElement.prototype.click` → `download="AGENTS.md"`, Blob text (read with FileReader) = content; with `isRescanning=true` Download stays enabled and works | S1 |
| T-6 | AC-74, AC-75, AC-76, AC-77, EC-21 | Ubiquitous / State | view | component | ProjectContextView.test (m) | row button names = full paths, `title` = path; no "docs"/"readme" or `\d+t` in the list; selected row `aria-current="true"` with inline `color: var(--accent-text)`, the others `"false"` | S2 |
| T-7 | AC-78, AC-80, AC-86 | State / Unwanted (404) | ContextDocPreview | component | `…/ContextDocPreview/ContextDocPreview.test.tsx` (m; delete the Download test) | `doc=null` → only "Select a document to preview it.", no `context-preview-header`; with a doc → the header holds the path and "Used by 0 agents · 0 skills", 0 buttons; 404 `context_doc_not_found` → "The file no longer exists — run Rescan" after the header | S1 |
| T-8 | AC-82 | State | view | component | ProjectContextView.test | `truncated: true` → `page.truncated` text inside `context-docs-pane`, after the toolbar and before `list "Documents"` in DOM order | S3 |
| T-9 | AC-83 | State | view | component | same | `documents: []` → the patterns inside `context-preview-pane`; "Rescan" enabled inside `context-docs-pane`; `context-status-bar` present (D-3) | S3 |
| T-10 | AC-84, GAP-1 | State / Unwanted | view | component | same | `no_clone` → "Repository is not cloned yet"; a 500 on the list → the `page.loadError` text; in both cases no `context-doc-toolbar`, no `context-status-bar`, no "Rescan" button | S3 |
| T-11 | AC-85 | State | view | component | same | a fetch that never resolves → `context-docs-pane` has `aria-busy="true"` and ≥ 1 `context-doc-skeleton`; `context-preview-pane` present | S3 |
| T-13 | AC-88, AC-89, AC-90, AC-91, AC-107 | Ubiquitous | ContextDocsPicker | component | `client/src/components/context-docs-picker/ContextDocsPicker.test.tsx` (m) | inside `context-picker-header`: heading "Project context to use", text "2 of 4 attached · ~160 tokens", textbox "Filter documents…"; the subtitle contains a `CODE` element "## Project context"; order header → subtitle → `extra` (`<p>extra</p>`) → warning (T = 20 001) → first `context-doc-row` (`compareDocumentPosition`) | S4 |
| T-14 | AC-89 | Ubiquitous → both tabs | agent and skill ContextTab | component | both `ContextTab.test.tsx` (m) | the same subtitle "Order matters — earlier docs appear earlier…"; no "Attached documents are added…" text | S4 |
| T-15 | AC-92, AC-93 (order), AC-96, AC-97 | Ubiquitous / Unwanted (missing) | picker | component | ContextDocsPicker.test (m; update the T-35 assertion `"server"` → `"server/"`) | every `context-doc-row` has a `context-doc-handle-slot`, empty on unattached rows; folder text "server/"; a missing row shows "missing" and no type text; the Preview button contains `svg.lucide-eye` before its text | S5 |
| T-17 | AC-98, AC-100, AC-101, AC-102 | Event | picker | component | ContextDocsPicker.test (m) | see the T-17 steps under the table | S6 |

T-4 steps:
1. Before hover, `queryByRole("tooltip")` is null.
2. The "Rescan" button `toHaveAccessibleDescription("Rescan reads the local clone. Resync updates the clone from GitHub.")`.
3. `mouseEnter` or `focus` on the button → a tooltip with that text; `mouseLeave` → hidden again.
4. `getAllByText(hint)` has length 1.
5. In the view: click → `POST /repos/r1/context/rescan`; the button is disabled and its name is still "Rescan"; afterwards it is enabled and a row `new.md` is listed.

T-17 steps:
1. Preview → dialog "Preview of docs/a.md" inside `context-docs-picker`, and the list is still rendered.
2. The panel has the path and a "Close preview" button.
3. With the panel open, a checkbox click calls `onChange` as with the panel closed.
4. Preview on another row → still one dialog, now with the other path.

AC-108 and EC-26 get no component test: jsdom has no layout. They are proven in V-4.

### Existing tests affected
| Test file | Why it breaks | Change |
|---|---|---|
| `client/src/components/context-docs-picker/ContextDocsPicker.test.tsx` | the `hint` prop is removed (TS excess-prop error) | compile (implementer, S4) |
| same file, T-35 `getByText("server")` | the folder now renders as "server/" (AC-93) | assertion (test-writer, T-15) |
| `…/ProjectContextView/ProjectContextView.test.tsx`, T-33 "Rescan" | the visible hint and the "Rescanning…" name are gone (AC-8, AC-71, AC-72) | assertion (test-writer, T-4) |
| `…/ContextDocPreview/ContextDocPreview.test.tsx`, T-34 Download | Download moved to the toolbar (AC-70, AC-78) | assertion (test-writer, T-5 + T-7) |
| T-31, T-32, T-37, T-39, T-40, T-50; `AgentEditor.test.tsx`, `SkillDetail.test.tsx` | the region, texts, testids, tab buttons and the `ContextTab` mock are kept; only styles change in the shells | none expected |

## Verification (per package)
- client: `cd client && pnpm typecheck && pnpm test`
- manual (NFR-9). Headless Chrome at 1920×1000 driven by CDP (INSIGHTS 2026-10-11), against the dev stack with a cloned repository. Each screenshot is reviewed side by side with its mockup.
  - **V-1 (2.png):** page with a document selected.
    - `document.scrollingElement.scrollHeight === innerHeight`;
    - scrolling the docs pane by 2000 px leaves the toolbar and the status bar in place;
    - a long path is truncated with "…".
  - **V-2 (3.png):** a document with a wide table → horizontal scroll inside the preview pane; `document.documentElement.scrollWidth === innerWidth`.
  - **V-3 (4.png):** agent Context tab, panel closed: full width, one-line cards, type colours, aligned checkboxes.
  - **V-5 (8.png):** the same checks on the skill Context tab.
  - **V-4 (5.png, AC-98…AC-104, AC-108, EC-26):** run on both the agent and the skill editor.
    1. Short document (e.g. `client/docs/README.md`):
       - `panel.getBoundingClientRect().bottom` equals `innerHeight` (±1 px);
       - `panel.top` equals the `context-picker-header` top (±2 px);
       - there is empty space under the text.
    2. Long document: the panel rect (top and height) is identical to step 1; the panel body has `scrollHeight > clientHeight`; scrolling the panel body leaves the panel rect unchanged.
    3. Scroll the list column by 2000 px: the panel rect is unchanged, and the tab row, the editor header and the agent/skill list column are still visible.
    4. A wide table scrolls inside the panel; `getComputedStyle(panel).transition` has no non-zero duration.
    5. Repeat at 1280×1000 (EC-24): name and folder truncated, type, tokens and Preview visible.
    6. Regression: the agent Config and Skills tabs scroll with the tab row pinned.
  - **V-6 (4.png):**
    - pointer-drag a grip with `Input.dispatchMouseEvent` and take a screenshot before release: an overlay with an accent border and a dimmed placeholder at the origin, other rows not shifted;
    - then press Space → ArrowDown → Space on a grip: `PUT /agents/:id/context` is sent with the new order (AC-23, AC-58);
    - restore the order afterwards (it writes to the dev DB).
  - **V-7:** `mouseMoved` over Rescan → tooltip; Tab focus → tooltip; during a rescan, hover → tooltip still shown, icon spinning; Download still works.

## Execution mode
- **single-agent** (chosen by the user): `implementer` runs S1…S7 → `test-writer` writes T-1…T-17 in parallel with the reviewers → fix loop, all inside `/run-plan`. It fits: one package, 7 steps in two chains (page S1–S3, tab S4–S7) under one Stop-hook typecheck. `plan-verifier` is run manually afterwards.

## Handoff to reviewers
- Architecture:
  - `ContextDocToolbar` calls `useContextFile` itself (same query key as the preview, one request);
  - the `isFill` body in `AgentEditor` and `SkillDetail` is a tab-specific shell style, a footprint outside the picker;
  - `NO_SHIFT_STRATEGY` together with `DragOverlay`;
  - the `AgentEditorView` layout change affects every agent tab.
- Security: none

## Risks & open questions
- On the Context tab the list column is the scroll container instead of the tab body. dnd-kit auto-scroll during a drag must find it; this is checked in V-6. The tab body uses `overflow: hidden`, so any Context-tab state taller than the viewport is clipped. Today every state rendered outside the list column (skeleton, error, no-clone) is small; check in V-3 and V-5.
- The flex chain must give the tab body a definite height: `editorBody` → `AgentEditor.wrap` → `body`. If one `minHeight: 0` is missing, the panel grows with its content and AC-108 fails. V-4 step 1 catches this.
- Untested: whether `dom-accessibility-api` (jsdom) counts a `hidden` element referenced by `aria-describedby` when computing `toHaveAccessibleDescription`. If it does not, hide the tooltip visually (sr-only or opacity) instead of with `hidden`.
- A disabled Rescan button cannot take focus, so during a rescan the tooltip is reachable by hover only (EC-25). Whether mouse events reach the wrapper over a disabled button is checked in V-7.
- Keyboard drag with `NO_SHIFT_STRATEGY` + `DragOverlay` cannot run in jsdom; V-6 is the only proof.
