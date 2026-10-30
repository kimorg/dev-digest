# reviewer-core (`@devdigest/reviewer-core`) — agent map

Pure review engine: **diff → prompt → LLM → grounded findings**. Pipeline and public API:
[README](README.md).

## Stack

Node ≥ 22 · TypeScript · `openai` SDK · Zod 3 · Vitest · **npm** (has `package-lock.json`).

## Commands

```sh
npm install
npm test               # hermetic, stubbed LLMProvider — no keys, no network
npm run typecheck      # src + test (tsconfig.test.json); build = typecheck of src only
cd ../server && pnpm typecheck   # after any change here (server compiles this source)
```

## Where things live

- `src/index.ts` — the public API; everything consumers use is exported here
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate against the diff
- `src/llm/` — `openrouter.ts` provider, `structured.ts` (Zod → JSON Schema, parse-with-repair)
- `src/review/` — `run.ts` orchestration, `reduce.ts` map-reduce
- `src/output/to-review.ts` — CI payload helper (used from lesson L06)

## Conventions

- Stays **pure**: no DB, filesystem, GitHub or env reads. The only side effect is the
  injected `LLMProvider`.
- Contracts (`Review`, `Finding`, `Verdict`…) come from `@devdigest/shared`, which resolves
  to `../server/src/vendor/shared` — don't redefine them locally.
- New public function → export it from `src/index.ts`.
- Any new untrusted prompt input (PR text, code, specs, repo-derived context) goes through
  `wrapUntrusted()` — never concatenate it raw into the prompt.

## Naming

- Files kebab-case, grouped by pipeline stage (`llm/`, `review/`, `output/`).
- Functions camelCase, verb first (`assemblePrompt`, `groundFindings`, `reduceReviews`); converters
  `to<X>` (`toReviewPayload`, `toJsonSchema`), builders `build<X>` (`buildLineIndex`).
- Types: `<X>Input` → `<X>Outcome` / `<X>Result`, plus `<X>Options`, `<X>Parts` (`ReviewInput`,
  `ReviewOutcome`, `PromptParts`). Providers `<Vendor>Provider implements LLMProvider` +
  `<Vendor>ProviderOptions`.
- Constants SCREAMING_SNAKE; tunables `DEFAULT_*` (`DEFAULT_MAP_THRESHOLD_LINES`).
- Relative imports end in `.js`; tests are `test/<source-basename>.test.ts` (`to-review.test.ts`).

## Gotchas

- The server consumes this package's TypeScript source via a path alias (tsx in dev,
  vitest in tests). A breaking change here breaks the server, and CI runs server suites on it.
- Prompt slots `skills`, `memory`, `specs`, `callers` are optional on purpose — the starter
  passes only diff + system prompt + repo map; lessons fill the rest.

## Do not touch

- Grounding: a finding without a real cited diff line is dropped; the score is recomputed
  from surviving findings, never taken from the model.
- `INJECTION_GUARD` is appended to every system prompt. Untrusted content stays data. No
  keyword denylists.
- `package-lock.json` — never hand-edit; it changes only via `npm install|uninstall` and is committed
  with `package.json` (CI runs `npm ci`). Don't add a `pnpm-lock.yaml`.

## Read before you work

- Feature spec for the task → [specs/](specs/README.md)
- Deeper reference → [docs/](docs/README.md) · test strategy → [../TESTING.md](../TESTING.md)
- Past learnings → [INSIGHTS.md](INSIGHTS.md) — read before non-trivial work; new entries are
  added by the `engineering-insights` skill (append-only, no duplicates).
