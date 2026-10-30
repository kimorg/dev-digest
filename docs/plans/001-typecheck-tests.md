# Development Plan: typecheck `server/test/**` and `reviewer-core/test/**` locally, in CI and in the agent gates + fix the 14 existing errors
Status: READY · Packages: server, reviewer-core (+ `.github/workflows`, `.claude/` hooks/agents/skills, `TESTING.md`)
Revision: 2 (2026-10-27) — per the user's decision, S7 added: `pr-self-review` and `implementer-verify` check tests too.

## Goal & non-goals
- Goal: `pnpm typecheck` (server) and `npm run typecheck` (reviewer-core) check `src/**` **and** `test/**`
  (including `*.it.test.ts` and `server/test/helpers/*.ts`) and pass with 0 errors; the CI jobs that
  already call these scripts block a PR with a type error in a test; the test-writer hook, the
  implementer hook and `pr-self-review` run the same check for server/reviewer-core.
- Non-goals: client, e2e; production-logic changes; a Windows matrix (there is none — see below);
  the stale skip-worktree mentions in `TESTING.md:83` / `server-unit.yml:96`.

## Context consulted
- INSIGHTS — server: 2026-10-27 "`pnpm typecheck` never sees `server/test/**`…" → this is the gap we
  close; afterwards a new `Supersedes:` entry, the old one is not edited.
- INSIGHTS — server: 2026-10-07 "`server/package.json` is not actually skip-worktree" → the change to
  the `typecheck` script is committed normally; CI keeps calling `pnpm typecheck`.
- INSIGHTS — server: 2026-10-13 "dependency-cruiser… resolves `@devdigest/shared` through the server's
  tsconfig alias" → `tsconfig.json` stays the single source of aliases for depcruise and `build`;
  the new config only `extends` it.
- INSIGHTS — reviewer-core: 2026-10-27 "`npm run typecheck` does not cover `reviewer-core/test/**`"
  (pointer) → a new pointer entry is needed.
- Rules: `server/package.json:8` — `build: tsc -p tsconfig.json` with `outDir: dist`
  (`server/tsconfig.json:18`). Widening the main config's `include` would emit tests into `dist/`
  → the "widen `tsconfig.json`" option is rejected.
- Rules: `server/tsconfig.json:24-25` — alias `@devdigest/reviewer-core` → `../reviewer-core/src`;
  server tests import only `src` → reviewer-core tests do not enter the server program.
- Rules: `reviewer-core/test/run.test.ts:3` imports `../../server/src/adapters/mocks.js`; those files
  (`mocks.ts`, `git/diff-parser.ts`) pull in only `zod` and `@devdigest/shared`, both mapped in
  `reviewer-core/tsconfig.json:21-25` → `npm ci` is enough in reviewer-core CI.
- Rules: `.github/workflows/server-unit.yml:4-8` — typecheck "on Linux only… deliberately do NOT
  matrix over Windows". **There is no Windows gate**; `TESTING.md:42-44` ("also runs on Windows…") is stale.
- Rules: `.claude/hooks/implementer-guard.mjs:5,26` — the implementer cannot edit `.claude/**` or
  `INSIGHTS.md` → S5, S7 and the `.claude/**` part of S6 are done by the main thread.
- Rules: `.claude/hooks/agent-guard.mjs:45-48` allows test-writer `pnpm typecheck` /
  `npm run typecheck`.
- Rules: `.claude/skills/pr-self-review/scripts/checks.mjs:24-33` (`runTypecheck`) and
  `.claude/hooks/implementer-verify.mjs:72` call `tsc --noEmit -p tsconfig.json` directly.
- Spec: none.

## Architecture
Application layers are unchanged — only tooling, tests and docs.

**Decision:** in each package a `tsconfig.test.json` (`extends: "./tsconfig.json"`,
`include: ["src/**/*.ts", "test/**/*.ts"]`); the `typecheck` script → `tsc --noEmit -p tsconfig.test.json`.
- Not `&&` of two runs: same options, the program is a superset of `src`, one run catches everything and is twice as fast.
- Not a separate `typecheck:test`: every existing mention of `pnpm typecheck` (CI, `implementer.md:91`,
  `planner.md`, `plan-verifier.md`, package `AGENTS.md`) automatically covers tests.
- `build` and `tsconfig.json` unchanged — emit, depcruise and aliases are untouched.
- The config lives in the package: outside it `types: ["node"]` does not resolve (TS2688).
- The agent gates (S7) pick `tsconfig.test.json` when it exists, else `tsconfig.json`
  (client stays on `tsconfig.json`, which already includes tests).

## Skill contract
| File (create/modify) | Skills | Rules the step must satisfy |
|---|---|---|
| `server/tsconfig.test.json`, `reviewer-core/tsconfig.test.json` (create) | — | aliases only via `tsconfig.json`; no `compilerOptions` except `noEmit: true` in server |
| `server/package.json`, `reviewer-core/package.json` (modify) | — | only `scripts.typecheck` changes; do not touch the lockfile |
| `server/test/adapters.test.ts` (modify) | `onion-architecture` | test through the `CodeIndex` port from `@devdigest/shared`, not the mock's type; do not touch production |
| `server/test/agents-versions.it.test.ts` (modify) | `drizzle-orm-patterns` | `select()` returns an array, the row may be `undefined` (`noUncheckedIndexedAccess`); keep the `*.it.test.ts` name |
| `server/test/prompt-callers.test.ts` (modify) | `onion-architecture` | `PromptParts` type from the public API of `@devdigest/reviewer-core`, no deep imports |
| `server/test/repo-intel-facade-degraded.test.ts` (modify) | `onion-architecture` | fixture matches the current `RepoBasics`; do not change production |
| `server/test/skills-import.test.ts` (modify) | — | an annotation instead of `as` casts |
| `reviewer-core/test/run.test.ts` (modify) | `zod` | `StructuredRequest<T>` from `@devdigest/shared`, not redefined locally |
| `.github/workflows/server-unit.yml`, `.github/workflows/reviewer-core.yml` (modify) | — | `npm ci` for reviewer-core stays; Linux-only stays |
| `.claude/hooks/test-writer-verify.mjs` (modify) | — | `skipped`/`failures` pattern, `MAX_OUTPUT_LINES`, no new dependencies |
| `.claude/hooks/implementer-verify.mjs`, `.claude/skills/pr-self-review/scripts/checks.mjs` (modify) | — | skip/NOT RUN behavior unchanged; only the config choice and its name in notes change |
| `.claude/agents/test-writer.md`, `.claude/agents/README.md`, `TESTING.md`, `server/AGENTS.md`, `reviewer-core/AGENTS.md` (modify) | — | verified facts only |

## Steps
### S1 — server: `tsconfig.test.json` + script
- Files: `server/tsconfig.test.json` (create), `server/package.json` (modify)
- Change: `{ "extends": "./tsconfig.json", "compilerOptions": { "noEmit": true }, "include": ["src/**/*.ts", "test/**/*.ts"] }`
  (`noEmit` — so an accidental `tsc -p tsconfig.test.json` does not emit tests into `dist/`).
  Script `"typecheck": "tsc --noEmit -p tsconfig.test.json"`; `build` unchanged.
- Depends on: —
- Done when: `pnpm typecheck` reports exactly the 13 known errors from `test/…`;
  `pnpm exec tsc -p tsconfig.json --listFilesOnly | grep -c '/server/test/'` → `0`.
- Verify: `cd server && pnpm typecheck` (expected to fail before S2)

### S2 — server: fix the 13 errors in tests
- Files: 5 server test files from the contract
- Change:
  - `adapters.test.ts:36` (TS2554) — `MockCodeIndex.symbols()` (`src/adapters/mocks.ts:303`) has no
    parameter, the port `CodeIndex.symbols(repo: RepoRef)` (`vendor/shared/adapters.ts:252`) has one;
    the test is typed by the concrete class. Fix: `const ci: CodeIndex = new MockCodeIndex();` +
    `import type { CodeIndex } from '@devdigest/shared'`.
  - `agents-versions.it.test.ts:168` (TS2339) — destructuring `[{ id }]` under
    `noUncheckedIndexedAccess`. Fix: `const [defaultRow] = await db.select(…)…; const defaultWs = defaultRow!.id;`
  - `prompt-callers.test.ts:16-23` (7× TS2345) — `as const` turns arrays into `readonly [...]`, while
    `PromptParts` (`reviewer-core/src/prompt.ts:39-47`) expects `string[]`. Fix: drop `as const`,
    `const COMMON: PromptParts = {…}`, `import { assemblePrompt, type PromptParts } from '@devdigest/reviewer-core'`
    (exported in `src/index.ts:19`).
  - `repo-intel-facade-degraded.test.ts:112,117,122` (TS2741) — drift: `RepoBasics.defaultBranch`
    is required (`src/modules/repo-intel/repository.ts:62`). Fix: `defaultBranch: 'main'` in the three literals.
  - `skills-import.test.ts:122-127` (TS2345) — an array of heterogeneous literals is inferred as a union
    with `?: undefined`. Fix: `const archives: Record<string, string>[] = [ … ]; for (const files of archives) { … }`
- Skills: `onion-architecture`, `drizzle-orm-patterns`
- Depends on: S1
- Done when: `pnpm typecheck` → 0 errors; unit lane green.
- Verify: `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`;
  `pnpm exec vitest run test/agents-versions.it.test.ts` (self-skips without Docker → NOT RUN).

### S3 — reviewer-core: config, script, `run.test.ts`
- Files: `reviewer-core/tsconfig.test.json` (create), `reviewer-core/package.json`, `reviewer-core/test/run.test.ts` (modify)
- Change: `{ "extends": "./tsconfig.json", "include": ["src/**/*.ts", "test/**/*.ts"] }` (`noEmit`
  inherited, `tsconfig.json:18`). `"typecheck": "tsc --noEmit -p tsconfig.test.json"`; `build` unchanged.
  `run.test.ts:111` (TS7006): a generic method in an object literal gets no contextual type →
  `async completeStructured<T>(req: StructuredRequest<T>)` + `StructuredRequest` in the `import type` on line 2
  (`vendor/shared/adapters.ts:55`).
- Skills: `zod`
- Depends on: —
- Done when: `npm run typecheck` → 0; `npm test` green; server typecheck not broken.
- Verify: `cd reviewer-core && npm run typecheck && npm test && cd ../server && pnpm typecheck`

### S4 — CI
- Files: `.github/workflows/server-unit.yml`, `.github/workflows/reviewer-core.yml`
- Change: server-unit — in the header comment (lines 3–8) state that typecheck covers
  `src/**` + `test/**` via `tsconfig.test.json`; the step on line 66 → `name: Typecheck (src + test)`,
  `run: pnpm typecheck`. reviewer-core — the step on line 47 → `name: Typecheck (src + test)`; add
  `server/src/adapters/mocks.ts` and `server/src/adapters/git/diff-parser.ts` to `paths` (push and pull_request).
- Depends on: S2, S3
- Done when: both YAML files parse; the typecheck step calls the script from S1/S3.
- Verify: `cd server && node --input-type=module -e "import {parse} from 'yaml';import {readFileSync} from 'node:fs';for (const f of ['server-unit','reviewer-core']) parse(readFileSync('../.github/workflows/'+f+'.yml','utf8'))"`

### S5 — test-writer hook (main thread)
- Files: `.claude/hooks/test-writer-verify.mjs`
- Change: `const TYPECHECK = { client: ['--noEmit'], server: ['--noEmit','-p','tsconfig.test.json'], 'reviewer-core': ['--noEmit','-p','tsconfig.test.json'] }`;
  typecheck every package with a changed test (`*.test.ts(x)`, including `*.it.test.ts`, or a file
  under `<pkg>/test/helpers/`) — a separate `typecheckPkgs` set; vitest still gets only unit files.
  Errors — `error TS` filter, label `${pkg}: tsc ${args.join(' ')}`; missing `tsc` →
  `skipped.push(\`${pkg} typecheck (deps not installed)\`)`. In the header (lines 3–8) remove
  "server and reviewer-core tsconfigs cover src/ only".
- Depends on: S2, S3
- Done when: with changed server and reviewer-core tests the hook runs vitest + tsc for both and exits 0.
- Verify: `node --check .claude/hooks/test-writer-verify.mjs && echo '{"cwd":"/home/kimorg/projects/dev-digest","agent_id":"plan-smoke"}' | node .claude/hooks/test-writer-verify.mjs; echo "exit=$?"`

### S6 — documentation (`.claude/**` — main thread, the rest — implementer)
- Files: `.claude/agents/test-writer.md`, `.claude/agents/README.md`, `TESTING.md`, `server/AGENTS.md`, `reviewer-core/AGENTS.md`
- Change:
  - `test-writer.md:121-125` — server: + `pnpm typecheck` (covers `test/**`, including `.it.test.ts`
    that do not run without Docker); reviewer-core: + `npm run typecheck`; `:130` — the hook also typechecks tests.
  - `README.md:175` — "+ client `tsc --noEmit` after a client test" → "+ typecheck of the touched package
    (client `tsc --noEmit`, server/reviewer-core `tsconfig.test.json`)".
  - `TESTING.md:41-44` — remove the false "also runs on Windows…" → "Linux only (see `server-unit.yml`
    header); covers `src/**` + `test/**` via `tsconfig.test.json`"; in "Running locally" add
    `cd server && pnpm typecheck` and `cd reviewer-core && npm run typecheck`.
  - `server/AGENTS.md:17` — `pnpm typecheck   # src + test (tsconfig.test.json); build uses tsconfig.json`.
  - `reviewer-core/AGENTS.md:15` — `npm run typecheck      # src + test (tsconfig.test.json); build = typecheck of src only`.
- Depends on: S1–S5, S7
- Done when: `grep -rn "src/ only" .claude/hooks .claude/agents` is empty;
  `grep -n "tsconfig.test.json" TESTING.md server/AGENTS.md reviewer-core/AGENTS.md .claude/agents/test-writer.md` — all four files.

### S7 — agent gates: `pr-self-review` and `implementer-verify` (main thread)
- Files: `.claude/skills/pr-self-review/scripts/checks.mjs`, `.claude/hooks/implementer-verify.mjs`
- Change: in both places the config is chosen as
  `const project = existsSync(join(dir, 'tsconfig.test.json')) ? 'tsconfig.test.json' : 'tsconfig.json';`
  and passed as `['--noEmit', '-p', project]`.
  - `checks.mjs:24-40` (`runTypecheck`): the `tsconfig.json` existence check (line 28) stays;
    notes and `notRun(...)` refer to `${pkg}/${project}`; the comment on line 24 — "`tsc --noEmit`
    in one package (src + test where `tsconfig.test.json` exists)".
  - `implementer-verify.mjs:72`: the same `project` choice (from `cwd`); in the header (lines 2–3) —
    "Typechecks (src + test) every package…".
- Depends on: S2, S3 (otherwise the gates block immediately on the 14 known errors)
- Done when: `runTypecheck('server', root)` and `runTypecheck('reviewer-core', root)` return
  `typecheck <pkg>: ok`; a deliberate type error in `server/test/*.test.ts` yields a CRITICAL finding with
  the test file's path (check, then revert).
- Verify:
  `node --check .claude/skills/pr-self-review/scripts/checks.mjs && node --check .claude/hooks/implementer-verify.mjs`;
  `node --input-type=module -e "import {runTypecheck} from './.claude/skills/pr-self-review/scripts/checks.mjs';for (const p of ['server','reviewer-core']) console.log(runTypecheck(p, process.cwd()).note)"`

## Cross-cutting
- Contracts: none (`CodeIndex`, `StructuredRequest` are only imported; the `vendor/shared` copies are unchanged).
- DB / migrations: none · e2e: none · i18n: none · dependencies: none (`typescript` already in devDeps).
- After implementation the main thread runs `/engineering-insights` (append-only):
  - `server/INSIGHTS.md` → Tool & Library Notes: `### 2026-10-27 — \`pnpm typecheck\` now covers \`server/test/**\` via \`tsconfig.test.json\``,
    the Insight starts with `Supersedes: "\`pnpm typecheck\` never sees \`server/test/**\`; vitest runs tests without type checking"`;
    Evidence: `server/tsconfig.test.json`, `server/package.json` (`typecheck`), `checks.mjs` / `implementer-verify.mjs`
    (picks `tsconfig.test.json`); note that `build` stays on `tsconfig.json` (no tests).
  - `reviewer-core/INSIGHTS.md`: pointer `### 2026-10-27 — \`npm run typecheck\` now covers \`reviewer-core/test/**\``
    with `Supersedes: "\`npm run typecheck\` does not cover \`reviewer-core/test/**\`"` → "See `server/INSIGHTS.md` → …".
  - Session Notes in both files.

## Tests
| Test file (modify) | Kind | What it proves |
|---|---|---|
| `server/test/adapters.test.ts` | unit | the mock adapter matches the `CodeIndex` port at the type level |
| `server/test/prompt-callers.test.ts` | unit | the fixture matches `PromptParts` |
| `server/test/repo-intel-facade-degraded.test.ts` | unit | the fixture matches the current `RepoBasics` |
| `server/test/skills-import.test.ts` | unit | archives are typed as `Record<string,string>[]` |
| `server/test/agents-versions.it.test.ts` | it | safe read of the row from `select()` |
| `reviewer-core/test/run.test.ts` | unit | the stub provider is typed by `LLMProvider` |

No new tests; behavioral assertions do not change — `typecheck` itself catches the regression.

## Verification (per package)
- server: `pnpm typecheck` · `pnpm exec vitest run --exclude '**/*.it.test.ts'` · with Docker `pnpm exec vitest run .it.test`.
- reviewer-core: `npm run typecheck` · `npm test` · `cd ../server && pnpm typecheck`.
- hooks/CI/gates: Verify from S4, S5, S7.

## Handoff to reviewers
- Architecture: `tsconfig.test.json` does not override `paths`/`types`/`strict`; `build` and depcruise
  stay on `tsconfig.json`; the widened trigger in the test-writer hook does not run vitest for `*.it.test.ts`.
- Security: none — local `tsc` only.

## Risks & open questions
- Whether the typecheck step blocks a PR depends on branch protection (required checks) — verify on
  GitHub that `server unit / typecheck` and `reviewer-core / tests` are required.
- `MockCodeIndex.symbols()` (`src/adapters/mocks.ts:303`) has no `repo` parameter — no runtime impact;
  align it separately (out of scope, it is `src`).
- The "13 / 1" count comes from the 2026-10-27 run; if the tree changed, classify new errors the same
  way (contract drift vs. test bug) and do not touch production.
- Typecheck time in server and in the gates (`pr-self-review`, `implementer-verify`) grows slightly (~33 test
  files + testcontainers types) — not measured; check `TSC_TIMEOUT_MS` in `implementer-verify.mjs`.
- Out of scope: `TESTING.md:83`, `server-unit.yml:96` — stale skip-worktree mentions.
