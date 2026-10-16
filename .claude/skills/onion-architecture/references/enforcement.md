# Enforcement: dependency rules, baseline, review

Rules nobody checks stop being followed. The server already depends on `dependency-cruiser`
(repo-intel uses it), so the rules below run with no new install. They live **in this skill** and are
not wired into CI or `package.json`. Run them ad hoc, against a baseline, so you see only what *your*
change added.

## Contents
- [Workflow: baseline, change, compare](#workflow-baseline-change-compare)
- [Server rules (`onion.cjs`)](#server-rules-onioncjs)
- [What each rule protects](#what-each-rule-protects)
- [reviewer-core rule (`core.cjs`)](#reviewer-core-rule-corecjs)
- [Reading the output](#reading-the-output)
- [Limits of the check](#limits-of-the-check)
- [Known legacy violations (snapshot)](#known-legacy-violations-snapshot)
- [Review checklist (manual)](#review-checklist-manual)

## Workflow: baseline, change, compare

1. Copy the config below to a scratch file **outside the repo** (e.g. `$TMPDIR/onion.cjs`). Don't commit
   it, or the baseline, unless the team decides to adopt them in CI.
2. **Before you change anything**, from `server/`:
   ```sh
   pnpm exec depcruise src --config "$TMPDIR/onion.cjs" --output-type baseline --output-to "$TMPDIR/onion-known.json"
   ```
3. Make your change.
4. **Compare**, so only new violations show:
   ```sh
   pnpm exec depcruise src --config "$TMPDIR/onion.cjs" --ignore-known "$TMPDIR/onion-known.json" --output-type err
   # every violation, legacy included:
   pnpm exec depcruise src --config "$TMPDIR/onion.cjs" --output-type err
   # reviewer-core (resolved through the server's path alias):
   pnpm exec depcruise ../reviewer-core/src --config "$TMPDIR/core.cjs" --output-type err
   ```
5. A new violation is a blocker: fix it, or explain the exception in the PR.

Notes:
- **Reviewing someone else's diff:** build the baseline from the base revision in a scratch
  `git worktree`, then compare it with the head checkout. Run both from the same path layout, because
  the baseline matches violations by file path.
- pnpm resolves packages to `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/…`. That's why npm
  patterns use `(^|/)node_modules/<pkg>/`. The form `^node_modules/<pkg>/` matches nothing, and the rule
  then passes silently.
- `tsPreCompilationDeps: true` makes `import type` visible, which the type-only exceptions rely on.
- `depcruise-baseline` is the deprecated alias of `--output-type baseline`.

## Server rules (`onion.cjs`)

Verified on the current code: it reports only the known violations listed below. It also catches
every synthetic case it targets:
- prefixed files, ring subfolders and `_shared`;
- a port importing its implementation or a DB row;
- a service importing a repository type, the container, or the job runner / SSE bus / config loader;
- wiring importing a concrete adapter;
- cross-module imports.

A correctly built self-contained module passes cleanly. That means wiring, ports in module types, a
repository mapping rows through helpers, contract-typed `publish`/`enqueue` functions, and a
`platform/ports` adapter.

```js
/**
 * Onion Architecture rules for server/src (onion-architecture skill v2.1.0).
 *
 * A module file's ring is decided by its name or folder. Anything that matches no ring is
 * treated as APPLICATION code (the strict default), so new files and folders can't escape.
 *   presentation   routes.ts · routes/** · http/**
 *   composition    wiring.ts
 *   infrastructure repository.ts · repository/** · infrastructure/**
 *   domain         domain.ts · domain/** · constants.ts · types.ts
 *   application    everything else (service.ts, ports.ts, helpers.ts, application/**, …)
 * platform/ is split too: errors, resilience, trace-builder, price-book, model-router and ports/ are
 * core-safe; jobs, sse, config, prompts, run-logger and container are infrastructure/composition.
 */
const MODULE = '^src/modules/[^/_][^/]*/';
const PRESENTATION = '^src/modules/[^/]+/(routes|http)(\\.ts$|/)';
const COMPOSITION = '^src/modules/[^/]+/wiring\\.ts$';
const INFRASTRUCTURE = '^src/modules/[^/]+/(repository|infrastructure)(\\.ts$|/)';
const DOMAIN = '^src/modules/[^/]+/(domain|constants|types)(\\.ts$|/)';
const PORTS = ['^src/modules/[^/]+/ports(\\.ts$|/)', '^src/platform/ports/'];
const PURE_HELPERS = '^src/modules/[^/]+/helpers\\.ts$';
const CONTAINER = '^src/platform/container\\.ts$';
const PLATFORM_INFRA = '^src/platform/(jobs|sse|config|prompts|run-logger)\\.ts$';
const DB = '^src/db/';
const ROWS = '^src/db/rows\\.ts$';
const ADAPTERS = '^src/adapters/';
const NPM_INFRA =
  '(^|/)node_modules/(drizzle-orm|postgres|openai|@anthropic-ai|octokit|@octokit|simple-git|@vscode/ripgrep|@ast-grep|dependency-cruiser|js-tiktoken|p-queue|graphology[^/]*)/';
const FRAMEWORK = '(^|/)node_modules/(fastify|@fastify|fastify-[^/]+)/';
// repo-intel is the documented facade over its own adapters (ast-grep, dependency-cruiser, …).
const FACADE_EXEMPT = '^src/modules/repo-intel/';

module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'Domain imports only its own module\'s domain files, platform/errors and @devdigest/shared.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/(domain|constants|types)(\\.ts$|/)' },
      to: {
        path: [DB, ADAPTERS, NPM_INFRA, FRAMEWORK, '^src/platform/', '^src/modules/'],
        pathNot: ['^src/platform/errors\\.ts$', '^src/modules/$1/(domain|constants|types)(\\.ts$|/)'],
      },
    },
    {
      name: 'application-no-infrastructure',
      comment: 'Application code depends on ports, not on Drizzle, the schema, SDKs, adapters or Fastify. Row types may enter as type-only imports.',
      severity: 'error',
      from: { path: MODULE, pathNot: [PRESENTATION, COMPOSITION, INFRASTRUCTURE, DOMAIN, FACADE_EXEMPT] },
      to: { path: [DB, ADAPTERS, NPM_INFRA, FRAMEWORK], pathNot: ROWS },
    },
    {
      name: 'application-rows-type-only',
      comment: 'Row types enter the application ring only via `import type`.',
      severity: 'error',
      from: { path: MODULE, pathNot: [PRESENTATION, COMPOSITION, INFRASTRUCTURE, DOMAIN] },
      to: { path: ROWS, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'application-no-container',
      comment: 'Services get explicit dependencies; only composition (wiring.ts, routes plugin bootstrap, platform) reads the container. Passing the container is a service locator.',
      severity: 'error',
      from: { path: MODULE, pathNot: [PRESENTATION, COMPOSITION] },
      to: { path: CONTAINER },
    },
    {
      name: 'application-no-platform-infrastructure',
      comment: 'Application code does not reach the job runner, SSE bus, config loader, prompt files or run logger directly; wiring passes narrow, contract-typed functions instead.',
      severity: 'error',
      from: { path: MODULE, pathNot: [PRESENTATION, COMPOSITION] },
      to: { path: PLATFORM_INFRA },
    },
    {
      name: 'application-no-repository',
      comment: 'Application code depends on ports, never on a repository (not even its type); wiring.ts constructs repositories.',
      severity: 'error',
      from: { path: MODULE, pathNot: [PRESENTATION, COMPOSITION, INFRASTRUCTURE, DOMAIN] },
      to: { path: INFRASTRUCTURE },
    },
    {
      name: 'ports-are-contracts',
      comment: 'A port is an interface owned by the core, shaped by contract/module types: it never refers to its implementation, DB rows, tools, platform infrastructure or the container.',
      severity: 'error',
      from: { path: PORTS },
      to: { path: [INFRASTRUCTURE, DB, ADAPTERS, NPM_INFRA, FRAMEWORK, CONTAINER, PLATFORM_INFRA, PRESENTATION, COMPOSITION] },
    },
    {
      name: 'routes-no-data-access',
      comment: 'Driving adapters call services built by wiring.ts; they never query the DB or touch repositories/adapters.',
      severity: 'error',
      from: { path: PRESENTATION },
      to: { path: [DB, ADAPTERS, '(^|/)node_modules/drizzle-orm/', INFRASTRUCTURE] },
    },
    {
      name: 'wiring-uses-container-adapters',
      comment: 'wiring.ts builds the module from container-provided adapters; it does not import concrete adapters, Drizzle or the schema.',
      severity: 'error',
      from: { path: COMPOSITION },
      to: { path: [ADAPTERS, NPM_INFRA, FRAMEWORK, '^src/db/schema'] },
    },
    {
      name: 'infrastructure-no-upward',
      comment: 'Repositories and adapters implement ports; they never import services, routes, wiring, the container or Fastify.',
      severity: 'error',
      from: { path: [INFRASTRUCTURE, ADAPTERS] },
      to: {
        path: [MODULE, FRAMEWORK, CONTAINER],
        pathNot: [DOMAIN, PORTS[0], PURE_HELPERS, INFRASTRUCTURE],
      },
    },
    {
      name: 'no-cross-module-internals',
      comment: 'Modules use each other only through the owner\'s types.ts facade (resolved via the container) or _shared.',
      severity: 'error',
      from: { path: '^src/modules/([^/_][^/]*)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/', '^src/modules/[^/]+/types\\.ts$'],
      },
    },
    {
      name: 'adapters-only-via-container',
      comment: 'Concrete adapters are imported only by the composition root (container/app/server); mocks.ts is for tests.',
      severity: 'error',
      from: { path: '^src/', pathNot: [CONTAINER, '^src/app\\.ts$', '^src/server\\.ts$', ADAPTERS, FACADE_EXEMPT] },
      to: { path: ADAPTERS, pathNot: '^src/adapters/mocks\\.ts$' },
    },
    {
      name: 'shared-kernel-is-thin',
      comment: '_shared holds request-context and schema helpers only: no data access, adapters or feature modules.',
      severity: 'error',
      from: { path: '^src/modules/_shared/' },
      to: { path: [DB, ADAPTERS, NPM_INFRA, MODULE] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['^src/vendor/', '^clones/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.js'] },
  },
};
```

## What each rule protects

| Rule | Boundary |
|---|---|
| `domain-is-pure` | domain imports only its own module's domain files, `platform/errors` and the contracts |
| `application-no-infrastructure` | application code doesn't import Drizzle, the schema, SDKs, adapters or Fastify (row types: type-only) |
| `application-rows-type-only` | row types enter application code only as `import type` |
| `application-no-container` | no service locator: application code never imports the container, even as a type |
| `application-no-platform-infrastructure` | application code doesn't import the job runner, SSE bus, config loader, prompt files or run logger; it gets narrow functions from wiring |
| `application-no-repository` | application code depends on ports, never on a repository, not even its type; `wiring.ts` constructs repositories |
| `ports-are-contracts` | a port (`ports.ts`, `platform/ports/`) never names its implementation, a DB row, a tool, platform infrastructure, the container or wiring |
| `routes-no-data-access` | entry points in `routes`/`http` don't touch the DB, repositories or adapters |
| `wiring-uses-container-adapters` | `wiring.ts` builds from container-provided adapters, never concrete ones, Drizzle or the schema |
| `infrastructure-no-upward` | repositories and adapters import only domain, ports and pure helpers from modules, never services, routes, wiring, the container or Fastify |
| `no-cross-module-internals` | modules see each other only through `types.ts` facades or `_shared` |
| `adapters-only-via-container` | concrete adapters are imported only by the platform composition root |
| `shared-kernel-is-thin` | `_shared` has no data access, adapters or feature imports |

`modules/repo-intel/` is exempt only from the adapter rules (`application-no-infrastructure`,
`adapters-only-via-container`), because it is the documented facade over its own libraries. Its
container and repository use is still reported as legacy.

## reviewer-core rule (`core.cjs`)

```js
/**
 * reviewer-core stays pure (onion-architecture skill v2.1.0). Run from server/.
 * src/llm/ is the package's adapter area (OpenRouterProvider + its JSON-schema helpers); the engine
 * (everything else) depends only on the LLMProvider port.
 */
module.exports = {
  forbidden: [
    {
      name: 'engine-no-io',
      comment: 'The engine reads no DB, filesystem, network, process or env; its only side effect is the injected LLMProvider.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/llm/' },
      to: {
        path: [
          '^(node:)?(fs|fs/promises|child_process|net|http|https|dns|worker_threads)$',
          '(^|/)node_modules/(drizzle-orm|postgres|octokit|@octokit|simple-git|fastify)/',
          '^src/(?!vendor/shared/)',
        ],
      },
    },
    {
      name: 'engine-no-vendor-sdk',
      comment: 'Engine code never imports an LLM SDK or the adapter area; it talks to the LLMProvider port.',
      severity: 'error',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: ['^\\.\\./reviewer-core/src/llm/', '^\\.\\./reviewer-core/src/index\\.ts$'] },
      to: { path: ['(^|/)node_modules/(openai|@anthropic-ai)/', '^\\.\\./reviewer-core/src/llm/'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.js'] },
  },
};
```

`src/llm/` is the package's adapter area: `OpenRouterProvider` and its JSON-schema helpers (see
[stack-rules.md](stack-rules.md#reviewer-core-pure-domain-service-library)). It is exempt from
`engine-no-io`. Everything else is engine code, which may not import an LLM SDK or `llm/`
(`engine-no-vendor-sdk`). The public `index.ts` re-exports `llm/` for composition roots.

## Reading the output

`error <rule>: <from> → <to>` means `<from>` imports `<to>` across a forbidden boundary.

| Rule | Usual fix |
|---|---|
| `routes-no-data-access` | move the query into the module's repository and the orchestration into the service; the route calls one method on the service from `wiring.ts` |
| `application-no-infrastructure` → `src/db/schema.ts` | `import type { XRow } from '../../db/rows.js'` (add the row type if it's missing); move queries into the repository |
| `application-no-infrastructure` → an adapter | depend on a port and receive the adapter through wiring |
| `application-no-container` | give the service a deps object; build it in `wiring.ts` |
| `application-no-platform-infrastructure` | inject a contract-typed function from wiring (`publish(runId, kind, msg)`, `enqueue(ws, payload)`, config values) |
| `application-no-repository` | declare the port in `ports.ts`; move `new XRepository(...)` into `wiring.ts`; move row types the service needed into the port's module types |
| `ports-are-contracts` | describe the port with contract/module types; the repository maps rows to them through `helpers.ts` |
| `wiring-uses-container-adapters` | add or use a container getter for the tool (with an override slot) |
| `no-cross-module-internals` | expose what's needed through the owner's `types.ts` facade, `platform/ports/`, or the contracts |
| `adapters-only-via-container` | resolve the adapter from the container in wiring; a pure helper living in `adapters/` moves next to its consumer |
| `shared-kernel-is-thin` | move the code into the module that owns it |

## Limits of the check

- **Edges, not usages.** The baseline matches `from → to` file pairs. One more `this.container.x` read in
  a legacy service that already imports the container is invisible to it. The manual checklist covers this.
- **Imports, not behavior.** A handler that branches on business state, or a repository method that
  decides a business rule, imports nothing forbidden. That needs review.
- **File naming drives classification.** An HTTP file outside `routes.ts`, `routes/` or `http/` is checked
  as application code, which is stricter, not looser. Keep the naming.

## Known legacy violations (snapshot)

This is the state when v2.1.0 was written (40 violations in 20 files). **The baseline file you generate is
the source of truth.** This table is only orientation, and it goes stale as legacy code is fixed.

| File | Rules | Target shape |
|---|---|---|
| `server/src/modules/pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts` | `routes-no-data-access` ×2 each (drizzle-orm, schema) | `<Domain>Service` + repository implementing a port, built in the module's `wiring.ts` |
| `server/src/modules/settings/feature-models.ts` | `application-no-infrastructure` ×2, `application-no-container` | queries move into a settings repository behind a port |
| `server/src/modules/agents/service.ts`, `reviews/service.ts` | `application-no-container`, `application-no-repository` | explicit deps object built in the module's `wiring.ts` |
| `server/src/modules/agents/helpers.ts`, `reviews/helpers.ts`, `reviews/findings.ts` | `application-no-repository` (row types re-exported from `repository.ts`) | `import type` row types from `db/rows.ts`, or the port's module types |
| `server/src/modules/repos/service.ts` | `application-no-container`, `application-no-repository`, `no-cross-module-internals` (→ `repo-intel/constants.ts`) | explicit deps; the constant comes through the repo-intel facade or the contracts |
| `server/src/modules/reviews/run-executor.ts` | `application-no-container`, `application-no-repository`, `application-no-infrastructure` (schema), `application-no-platform-infrastructure` (→ `run-logger.ts`) | explicit deps incl. `publish`; row types from `db/rows.ts` |
| `server/src/modules/reviews/diff-loader.ts` | `application-no-container`, `application-no-repository`, `application-no-infrastructure` ×2, `adapters-only-via-container` (→ `adapters/git/diff-parser.ts`) | row type from `db/rows.ts`; the parser behind `GitClient` or into a pure shared module |
| `server/src/modules/repos/helpers.ts` | `application-no-infrastructure` (schema value import for `toRepoDto`) | `RepoRow` in `db/rows.ts` |
| `server/src/modules/repo-intel/{service,index}.ts`, `repo-intel/pipeline/{full,incremental,rank,repo-map}.ts` | `application-no-repository` (all), `application-no-container` (service, full, incremental) | the facade gets a `wiring.ts` and a store port when repo-intel is next refactored |

Not visible to the import rules, also legacy:
- `ReviewRunExecutor` and the repo services read adapters from `this.container` at call sites.
- Job handlers are registered inside service constructors (`repos/service.ts`, `repo-intel/service.ts`).

## Review checklist (manual)

The import rules can't see behavior. Check these by reading the diff:
- [ ] Every new handler, job handler or MCP tool parses its input and calls one service method
- [ ] Every new service method reads like "load → decide (domain) → persist/emit → return"
- [ ] Business decisions live in named pure functions, with unit tests
- [ ] Services are built in `wiring.ts` with explicit, narrow dependencies; ports speak module/contract types, not rows
- [ ] Nothing module-local was added to the container; the footprint matches SKILL.md "Change footprint"
- [ ] New external I/O has a port, an adapter, a mock and a container override slot
- [ ] No new `this.container.x` reads in legacy services (the baseline can't see them)
- [ ] Every `UPDATE` and `DELETE` is scoped by workspace (and user/key where relevant)
- [ ] No row, SDK object or builder leaves its ring; responses go through a contract schema
- [ ] Errors are `AppError` subclasses; no HTTP status handling in services
