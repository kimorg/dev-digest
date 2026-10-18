# 003 — Skills Lab: Skills page, skill editor, agent Skills tab, prompt trace (client)
Status: active · Lesson: L02 · Related: ../../server/specs/003-skills.md

## Goal
Let the user manage reusable **skills** (create, import, edit, version, enable/disable, delete)
and attach them to agents in an order that becomes the order of the skill blocks in the
prompt. Make the effect visible in the run trace (the skills block and its token count).

## Non-goals
- Import from URL / community catalog (the modal has only **Create** and **From file**).
- Skill tabs Stats / Context / Evals; agent tabs Context / Evals / CI; "pull freq / accept"
  numbers on cards (later lessons).
- Code editor with syntax highlighting — the body is a monospace `Textarea`.

## UI & routes
(`#n` = requirement number in the L02 brief.)

### Navigation
- `src/vendor/ui/nav.ts`: new section **SKILLS LAB** under WORKSPACE with **Skills** (`/skills`,
  icon `Sparkles`, `gKey: "k"`) and **Agents** (moved here from WORKSPACE). `activeKeyFor()`
  already maps `/skills`; `messages/en/shell.json` already has `nav.skills`.
- `src/lib/routes.ts`: `routes.skills()`, `routes.skill(id, search?)`.
- Breadcrumbs: `Skills Lab › Skills › <skill name>` (same shape as the agents screens).

### `/skills` and `/skills/[id]` — master-detail (#9, #10, #25)
Both routes render one `SkillsView`: the **list** on the left (fixed width, own scroll), the
**detail** on the right. Clicking a card does `router.push(routes.skill(id))` — the list stays,
the detail pane swaps (the "side panel" of #10 *is* the right pane; no modal, no full-page jump).
`/skills` with nothing selected shows the `selectPrompt` empty state on the right.
- List header: "Skills" + **Add Skill** button; search input filters by name/description
  (client-side, `filterSkills()` helper).
- `SkillCard` (#9, #22, #23): name (truncated), type badge (rubric/convention/security/custom
  colours), enabled `Toggle`, trash `IconBtn`, 2-line description, `<source> · v<N>` (+ "Disabled"
  when off), chip `N agents`. Selected card is highlighted. Toggle and trash stop propagation.
- States: skeleton list; `ErrorState` with retry; empty state with an **Add Skill** CTA.
- Unknown / malformed id → `SkillNotFound` in the right pane (`isNotFoundError`, 404 and 422).

### Delete confirmation (#23, #24, #33, #34)
New shared `src/components/confirm-dialog/ConfirmDialog` (two consumers → shared): `Modal` with
title, message, **Cancel**, a red **Delete** button, the × close, and `Esc`. Pending state
disables both buttons.
- Skill: "\"{name}\" will be permanently removed. It is linked to {count} agents." On success:
  toast, and if the deleted skill was open → `router.replace(routes.skills())`.
- Agent: `AgentCard` replaces `window.confirm` with the same dialog.

### Add Skill modal (#11, #12, #15)
`AddSkillModal`, opened by **Add Skill**; tabs **Create** | **From file**.
- **Create**: Name, Description — field hint: *"Write it as a directive: what the agent must
  check or do. This is the skill's interface."*, Type select (Rubric / Convention / Security /
  Custom), Body (Markdown, monospace textarea, placeholder `# Rule …`). **Create skill** is
  disabled until all four are filled. 409 → inline error under Name. Success → close, toast,
  open the new skill.
- **From file**: a file input/drop zone accepting `.md,.zip` (≤ 512 KB checked client-side) →
  read as base64 → `useSkillImportPreview` → shows the **draft**: editable name/description/type,
  the rendered body (`Markdown`), `warnings`, and a collapsible "Ignored files (N) — never
  executed" list. A trust banner: *"An imported skill is someone else's instructions in your
  agent's prompt. Read it before saving. It is saved disabled."* **Import (disabled)** → `POST
  /skills` with `source: "imported_file"`. Nothing is saved before that click.

### Skill detail tabs (#25–#29) — `?tab=config|preview|versions` (default `config`)
Header: icon, name, `v<N>` badge, global enabled `Toggle`.
- **Config**: Name, Description (same hint), Type, Body textarea with file label
  `<slug>.md · ~N tokens` (`approxTokens`), **Save** (disabled when unchanged), hint *"Saving a
  changed body creates a new immutable version."* Form reseeds when the skill id or version changes.
- **Preview** (#26): "Rendered as the reviewing agent receives it." + the body through the
  `@devdigest/ui` `Markdown` primitive (formatted, not raw text).
- **Versions** (#27–#29): "Version history" + `N versions`; rows newest first; the current one
  has a green **Current** badge. Each older row: **Diff** → modal with a line diff of that
  version vs the current body (`diff` package, added/removed lines coloured, unchanged
  collapsed); **Restore** → `ConfirmDialog` → `useRestoreSkillVersion` → the list gains a new
  top version and the header badge bumps.

### Agents (#32–#37)
- `AgentCard` (#32): name, description, model, enabled toggle, `N skills` chip (`skill_count`),
  delete with `ConfirmDialog` (#33, #34).
- `/agents/:id` (#35): exactly two tabs — **Config** and **Skills** (`VALID_TABS = ["config",
  "skills"]`, `?tab=`). Config (#36) is the existing `ConfigTab` (name, description, provider,
  model list, review strategy, system prompt).
- `SkillsTab` (#13, #30, #31, #37): header "Skills" + "{linked} of {total} enabled", hint
  *"Order matters — earlier skills appear earlier in the assembled prompt. Toggle to attach."*,
  a filter input (by name).
  - Lists **all** skills of the workspace. Linked ones first, in link order, each with a grip
    handle and `#n`; unlinked ones below, newest first by `created_at` (same date → by name), no grip. Every row: `Toggle`, name,
    type label.
  - Toggle on → appended to the end of the linked list; off → removed. Each change sends the
    whole ordered list (`POST /agents/:id/skills { skill_ids }`), optimistic with rollback +
    error toast.
  - Drag & drop (`@dnd-kit/core` + `@dnd-kit/sortable`, pointer **and** keyboard sensors) works
    only among linked rows (#31); dropping saves the new order. While a filter is active,
    dragging is disabled (the visible order would not be the full order) with a hint.
  - A globally disabled skill is dimmed with a "disabled — skipped at run time" label.

### Run trace (#19)
`RunTraceDrawer` → `TraceBody` → **Prompt assembly**: each `PromptBlock` shows `~N tok` from
`prompt_assembly.tokens.<slot>`; the **Skills (dynamic)** block also lists `skill_refs`
(`name · vN · ~N tok`) in prompt order above the text. `tokens` / `skill_refs` undefined (old
traces) → no number, no list.

## Data
- `src/lib/hooks/skills.ts`: `useSkills`, `useSkill(id)`, `useCreateSkill`, `useUpdateSkill`,
  `useDeleteSkill`, `useSkillVersions(id)`, `useRestoreSkillVersion`, `useSkillImportPreview`.
  Mutations invalidate `["skills"]`, the detail and its versions; delete also invalidates
  `["agents"]` and agent skill links (counts change).
- `src/lib/hooks/agents.ts`: `useAgentSkills(agentId)`, `useSetAgentSkills(agentId)` (invalidates
  the agent list for `skill_count` and `["skills"]` for `agent_count`).
- `query-keys.ts`: `skills`, `skill(id)`, `skillVersions(id)`, `agentSkills(agentId)`.
- Contracts: `SkillListItem`, `CreateSkillRequest`, `UpdateSkillRequest`, `SkillVersion`,
  `SkillImportRequest`, `SkillImportDraft`, `Agent.skill_count`, `PromptAssembly.tokens`,
  `PromptAssembly.skill_refs` — mirrored from the server copy (see the server spec).
- i18n: rewrite `messages/en/skills.json` (its current keys describe an obsolete drawer design;
  keep what still fits: `page.*`, `selectPrompt`, `listItem.type.*`); add
  `agents.json` `skills.*` keys for the tab; `runs.json` `trace.tokens`; `common.json`
  `confirmDialog.*`. Nav labels in `nav.ts`.
- New dependencies (`pnpm add`): `@dnd-kit/core`, `@dnd-kit/sortable`, `diff` (+ `@types/diff`).

## Acceptance criteria
- #9 #22 `/skills` shows a card per skill with name, type, description, toggle, `vN`, `N agents`;
  toggling persists after reload.
- #10 #25 clicking a card changes the URL to `/skills/:id` and shows Config/Preview/Versions on the
  right while the list stays visible.
- #11 #12 Add Skill → Create with all four fields creates the skill and opens it.
- #15 From file accepts `docs/skills/flaky-test-patterns.zip`: shows the rendered body and
  `scripts/check.sh` under ignored files; nothing appears in the list until **Import (disabled)**;
  then the card shows "Disabled".
- #23 #24 trash → dialog; Cancel and × keep the skill, Delete removes it.
- #26 Preview renders headings/lists (no literal `**`).
- #27–#29 Versions lists all versions, Diff shows the changed lines, Restore creates a new top
  version with the old body.
- #13 #30 #31 #37 the agent Skills tab lists every skill with a toggle and type label, filters by
  name, and drags only linked rows; the new order survives reload.
- #14 swapping two skills and re-running puts their blocks in the new order in the trace.
- #19 the trace's Skills block shows its token count and per-skill rows.
- #32–#36 agent card fields, delete dialog, exactly two tabs, Config fields.
- Tests: `SkillCard.test.tsx`, `AddSkillModal.test.tsx` (create + file preview with a mocked
  hook), `VersionsTab.test.tsx`, `SkillsTab.test.tsx` (order, toggle → payload, no grip on
  unlinked rows, keyboard reorder), `ConfirmDialog.test.tsx`, `AgentCard.test.tsx` (dialog
  instead of `window.confirm`), `PromptBlock.test.tsx` (tokens shown / hidden when undefined).
- e2e: `e2e/specs/08-skills.flow.json` — open `/skills`, wait for "Uncovered Branches", open it,
  wait for the Preview tab text; `09-agent-skills.flow.json` — Test Quality Reviewer → Skills tab →
  "3 of 3 enabled" (seeded data only).

## Open questions
- Resolved 2026-10-17: master-detail at `/skills/:id` satisfies both "side panel" (#10) and
  "skill page with tabs" (#25); import is Create + From file only; the agent tab toggle means
  link/unlink.

## Revisions
- 2026-10-17 — implemented (client). `ConfirmDialog` is portalled to `<body>` (a disabled card's
  opacity would reach it) and takes `isDestructive={false}` for Restore. Markdown styles
  (`.dd-md` headings, lists, tables, code) added to the UI kit stylesheet — the reset had stripped
  them, so Preview showed plain paragraphs. Skill-type colours live in `src/lib/skill-type.ts`
  (Skills page + agent tab). Mutation errors use the global toast; only the 409 name conflict and
  import parse errors are also shown inline.
