# 003 — Skills: CRUD, versions, import, agent links, prompt injection (server)
Status: active · Lesson: L02 · Related: ../../client/specs/003-skills.md · Content: ../../docs/skills/README.md

## Goal
A **skill** is a reusable markdown instruction block, shared by agents: `name`, a directive
`description` (the skill's interface), `type` (`rubric | convention | security | custom`) and a
markdown `body`. The user creates, imports, edits, versions, enables/disables and deletes skills,
and links any number of them to an agent in an order. At review time the bodies of the agent's
linked **enabled** skills are injected into the prompt **in that order**, and the run trace shows
the skills block with its token weight.

The DB is the source of truth. Most of the plumbing already exists and is reused: tables
`skills`, `skill_versions`, `agent_skills` (`0000_init.sql`); contracts `Skill`, `AgentSkillLink`,
`PromptAssembly.skills`; routes `GET|POST /agents/:id/skills`; the engine slot
`PromptParts.skills` → `## Skills / rules`. Missing: a skills module, the run-time load, and
per-block token counts.

## Non-goals
- Import from URL and the community catalog (the `imported_url` / `community` sources stay unused).
- Skill Stats / Context / Evals (L06–L08); per-skill pull-frequency / acceptance numbers on cards.
- Moving skills into the system message: they stay in the **user** message, `## Skills / rules`
  slot (decision 2026-10-17). No reviewer-core change.
- Bumping the agent's version when its links change — the run trace records the exact skills used.
- Executing, unpacking to disk or storing anything from an imported archive except `SKILL.md`'s text.

## Contracts / API changes

### DB — migration `pnpm db:generate --name skills_crud` → `0011_skills_crud`
- `skills.updated_at timestamptz not null default now()`.
- Unique index `skills_ws_name_uq` on `(workspace_id, lower(name))`.
- `skills.source` enum gains `imported_file`.
- No table is dropped; `agent_skills` (PK `(agent_id, skill_id)`, `order`) and `skill_versions`
  (PK `(skill_id, version)`, `body`) are used as they are.

### `@devdigest/shared` (`contracts/knowledge.ts`, **both** vendored copies)
- `SkillSource` += `'imported_file'`.
- `SkillListItem = Skill & { agent_count: number; updated_at: string }`.
- `CreateSkillRequest = { name, description, type, body, source?: 'manual' | 'imported_file' }`.
- `UpdateSkillRequest = Partial<{ name, description, type, body, enabled }>` (at least one key).
- `SkillVersion = { skill_id, version, body, created_at }`.
- `SkillImportRequest = { filename: string; content_base64: string }`.
- `SkillImportDraft = { name, description, type, body, ignored_files: string[], warnings: string[] }`.
- `Agent.skill_count?: number`.
- Client copy also gains the server-only `AgentVersionConfig` / `AgentVersion` (drift fix).
- Field rules: `name` 1–80 chars, trimmed; `description` 1–300; `body` 1–32 000 chars.

### `contracts/trace.ts` (both copies) — all new fields `.nullish()` (old traces are never re-parsed)
- `PromptAssembly.tokens?: { system, skills, memory, specs, callers, repo_map, pr_description, user }`,
  each `number | null` (null = slot absent).
- `PromptAssembly.skill_refs?: { id, name, version, tokens }[]` — the skills injected, in prompt order.

### Module `src/modules/skills/` (`routes → service → repository`, `wiring.ts`, registered in `modules/index.ts`)
All queries are scoped to the request's workspace; another workspace's id → 404.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/skills` | `SkillListItem[]`, ordered by name; `agent_count` = links in `agent_skills` |
| GET | `/skills/:id` | `SkillListItem` |
| POST | `/skills` | 201 `SkillListItem`. Writes `version = 1` and the v1 `skill_versions` row in one transaction. `source = 'imported_file'` ⇒ `enabled = false` |
| PUT | `/skills/:id` | Partial update. **Body changed** ⇒ `version + 1` and a new `skill_versions` row; name/description/type/enabled changes don't bump. Always sets `updated_at` |
| DELETE | `/skills/:id` | 200 `{ ok: true }` (same as `DELETE /agents/:id`). FK cascade removes its `agent_skills` links and versions |
| GET | `/skills/:id/versions` | `SkillVersion[]`, newest first |
| GET | `/skills/:id/versions/:version` | one `SkillVersion`; unknown version → 404 |
| POST | `/skills/:id/versions/:version/restore` | Writes the old body as a **new** version (v13 = body of v4); returns the skill. Restoring a body equal to the current one is a no-op |
| POST | `/skills/import` | `SkillImportRequest` → `SkillImportDraft`. **Persists nothing** |

Errors: duplicate name (case-insensitive) → 409 `skill_name_taken`; invalid body → 422.

### Import parser (`src/modules/skills/import.ts`, pure, unit-tested)
- `.md`: optional YAML frontmatter `name`, `description`, `type`. Missing name → first `# ` heading
  → file name. Missing / unknown type → `custom` + a warning. Missing description → `''` + a warning
  (the user must fill it before saving).
- `.zip` (via `fflate`, in memory): the core is `SKILL.md` at the root or inside the only
  top-level folder; parsed as `.md`. Every other entry goes to `ignored_files` — never executed,
  never stored. No `SKILL.md` → 422 `skill_archive_no_core`.
- Limits: ≤ 512 KB decoded upload (fits the 1 MB `bodyLimit` as base64), ≤ 2 MB uncompressed total,
  ≤ 200 entries, body ≤ 32 000 chars → 422 with the limit named. Other extensions → 422.
- Frontmatter is parsed with the `yaml` package in its safe default schema (no custom tags).

### Agents module changes (`src/modules/agents/`)
- `GET /agents` and `GET /agents/:id` return `skill_count` (number of linked skills).
- `POST /agents/:id/skills` (`skill_ids` = full ordered list; `[]` unlinks all): every id must be
  a skill of the agent's workspace, else 404; delete + insert run in **one transaction**;
  `order = index`. Same workspace check for the single `skill_id` form.
- `GET /agents/:id/skills` is unchanged (`AgentSkillLink[]` by `order`).
- Repository: new `listEnabledSkillsForAgent(agentId)` — linked skills with `skills.enabled = true`,
  ordered by `agent_skills.order`.
- `DELETE /agents/:id` already exists (cascade removes its links) — used by the client's delete modal.

### Run path (`src/modules/reviews/run-executor.ts`)
- `runOneAgent` loads `listEnabledSkillsForAgent(agent.id)` and passes each rendered block as
  `skills` to `reviewPullRequest` (reviewer-core joins them with a blank line under `## Skills / rules`):
  ```
  <skill name="Uncovered Branches" version="3">
  Description: Flag every new or changed branch …
  
  <body>
  </skill>
  ```
  The tag delimits each block so a reorder is visible in the trace; skills are trusted
  instructions, so they are **not** wrapped in `<untrusted>`.
- After the review, the executor fills `prompt_assembly.tokens` (each slot counted with
  `container.tokenizer`) and `prompt_assembly.skill_refs` before `saveRunTrace`. Widen the
  tokenizer's "repo-intel only" scope comment. Failed-run traces (`traceFromBuffer`) leave both null.
- No skills linked / all disabled → `skills` omitted → section absent, `tokens.skills = null`.

## Trust
An imported skill is someone else's instructions inside the agent's prompt. Mitigations:
preview-before-save (`/skills/import` persists nothing), imported skills saved **disabled**,
archive scripts never run or stored, `INJECTION_GUARD` untouched. No keyword scanning of skill text.

## Acceptance criteria
(`#n` = requirement number in the L02 brief.)
- #9 #22 `GET /skills` returns name, type, description, enabled, version, `agent_count`.
- #12 `POST /skills` creates v1; a duplicate name in another case → 409; empty body → 422.
- PUT with a new body → `version` 2 and two `skill_versions`; PUT with only `enabled` → still v1.
- #23 #24 DELETE → 200; the skill disappears from `GET /agents/:id/skills` of every agent.
- #27 versions newest first; #29 restore of v1 on a v3 skill → v4 with v1's body.
- #15 `.md` and `.zip` previews return the draft; the fixture `docs/skills/flaky-test-patterns.zip`
  yields name "Flaky Test Patterns" and `ignored_files` containing `flaky-test-patterns/scripts/check.sh`;
  nothing is written to the DB; oversize / no `SKILL.md` / `.exe` → 422. Saving the draft with
  `source: 'imported_file'` → `enabled = false`.
- #32 `skill_count` on agents; linking another workspace's skill → 404.
- #14 Agent with skills A, B → trace `prompt_assembly.skills` has A's block before B's; after
  `POST /agents/:id/skills { skill_ids: [B, A] }` the next run has B before A. A disabled skill
  is absent from the prompt but stays linked.
- #19 `prompt_assembly.tokens.skills > 0` and `skill_refs` lists `{ name, version, tokens }` in order.
- Workspace isolation: another workspace's skill id → 404 on every `/skills/:id*` route.
- Tests: `test/skills.it.test.ts` (CRUD, versions, restore, cascade, counts, isolation, 409/422),
  `test/skills-import.test.ts` (unit: md/zip/limits/ignored files, using the docs fixture),
  `test/reviews.it.test.ts` (order + disabled + tokens in the persisted trace, mock LLM),
  `test/contracts.test.ts` (new contracts, nullish trace fields).

## Seed (done with this spec)
`pnpm db:seed` adds **Test Quality Reviewer** (`server/src/db/seed-prompts.ts`, original in
`docs/agent-prompts/test-quality-reviewer.md`) and three linked skills in order — Uncovered
Branches, Edge Case Checklist, Over-Mocking (`server/src/db/seed-skills.ts`, originals in
`docs/skills/`) — each with its v1 `skill_versions` row. The 4th skill, Flaky Test Patterns, is
imported through the UI to exercise the whole import path (#15). Idempotent by `(workspace, name)`.

## Open questions
Resolved 2026-10-17 (accepted defaults):
- Agent Skills tab toggle = link / unlink; no per-link `enabled` column. The skill-level
  `enabled` is global: a disabled skill stays linked but is skipped at run time.
- Only a body change creates a version; restore creates a new version instead of moving "current".
- Delete is a hard delete (cascade); no soft delete / trash.

Open:
- Control experiments #17/#18 need fixture PRs (happy-path-only test; a route signature change).
  Which repo/PRs to use is decided when the feature is implemented; #18 also needs an API Contract
  agent + breaking-change skill, not seeded by this spec.

## Revisions
- 2026-10-17 — implemented (server). DELETE answers 200 `{ ok: true }` like the agents
  module (was 204); restoring a body equal to the current one creates no version; `skill_ids`
  with duplicates → 422; the trace's token counts are computed before the run is marked `done`.
