# Stack rules: Onion with our tools

How each backend tool fits into the rings. API usage itself is covered by the tool skills
(`fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `postgresql-table-design`). This file only
decides placement and boundaries.

## Contents
- [Fastify (presentation)](#fastify-presentation)
- [Zod and fastify-type-provider-zod](#zod-and-fastify-type-provider-zod)
- [Drizzle ORM and Postgres (infrastructure)](#drizzle-orm-and-postgres-infrastructure)
- [SDK and CLI adapters (infrastructure)](#sdk-and-cli-adapters-infrastructure)
- [DI container (platform composition)](#di-container-platform-composition)
- [Jobs, SSE, MCP tools and CI hooks (entry points)](#jobs-sse-mcp-tools-and-ci-hooks-entry-points)
- [reviewer-core (pure domain-service library)](#reviewer-core-pure-domain-service-library)
- [Config and secrets](#config-and-secrets)

## Fastify (presentation)

**Ring:** route plugins are driving adapters. `buildApp()` is the platform bootstrap.

- **Keep `buildApp()` separate from `listen()`** (`app.ts` vs `server.ts`). Tests call `app.inject()`
  without opening a port, as Fastify's testing guide recommends. `buildApp()` still connects to the
  DB on boot: see [testing.md](testing.md).
- **One plugin per module**, registered statically in the module registry. Encapsulation keeps a
  module's decorators and hooks local. Don't use `fastify-plugin` to leak module internals upward.
- **Cross-cutting plugins register in the root before modules**: helmet, CORS, rate-limit, SSE, the
  validator/serializer compilers and the error handler.
- **Route plugin layout:**
  ```ts
  import { buildConventionService } from './wiring.js';

  export default async function conventionsRoutes(appBase: FastifyInstance) {
    const app = appBase.withTypeProvider<ZodTypeProvider>();
    const service = buildConventionService(app.container);  // the only construction line

    app.get('/repos/:id/conventions',
      { schema: { params: IdParams, response: { 200: z.array(Convention) } } },
      async (req) => {
        const { workspaceId } = await getContext(app.container, req);
        return service.listForRepo(workspaceId, req.params.id);  // one call, no logic
      });
  }
  ```
- **Handlers translate, they don't decide.** A handler may read the context, pick fields from
  `req.params/body/query`, call one service method, and set a non-default success status. It may not use
  `container.db`, import `drizzle-orm`, import a repository, call an SDK, or branch on business state.
- **Never pass `req` or `reply` into a service.** Pass parsed values. Logging goes through an injected
  `Logger` port, and `req.log` satisfies it at the call site.
- **Errors:** the service throws an `AppError` subclass. The root error handler builds the envelope.
- Extra HTTP files go in `routes/` or `http/`. `routes-admin.ts` would be classified as application code.

## Zod and fastify-type-provider-zod

**Ring:** shared contracts are the **shared kernel**, usable as types in any ring. *Parsing* happens only
at the edges.

- **Route schemas are the HTTP parser.** Declare `params`, `querystring`, `body` and `response`. The handler
  receives typed values, and responses are serialized against the contract. Don't hand-roll
  `Schema.parse(req.body)`.
- **Response schemas guard the boundary.** They stop extra row columns from leaking, but they don't
  replace `to<X>Dto` mapping.
- **Other edges parse explicitly:** job payloads (in the handler registered by wiring), MCP tool input,
  LLM structured output, and persisted JSONB read back (parse it, or keep new fields optional).
- **Domain functions take typed values, never `unknown`.**
- **Placement of schemas:** request-only shapes go in `routes.ts`. Module types and job payload schemas
  go in `types.ts`. Shapes that reach the client go in the shared contracts (both vendored copies).
  Naming follows `server/AGENTS.md`.

## Drizzle ORM and Postgres (infrastructure)

**Ring:** `drizzle-orm`, the schema modules, the DB client and migrations are infrastructure. Only
repositories and DB plumbing import them.

- **A repository implements the module's port.** For example, `ConventionRepository implements
  ConventionStore`, with a `Db` constructor argument and intention-revealing methods. It does not
  expose generic queries or return builders.
- **Constructed in `wiring.ts`** from `container.db`. A repository joins the container only when several
  modules share its table (as `agentsRepo` and `reviewRepo` do).
- **Return data:** the types the port declares (contract or module types, or DTO-ready read models),
  produced by pure row mappers in `helpers.ts`. A missing row is `undefined`.
- **Row types:** add a missing `XRow` (`$inferSelect`) to the row-type module. Only the repository and
  its mappers use it, the mappers through `import type`. Ports and services never mention rows. Insert
  shapes are interfaces declared in `ports.ts`.
- **Transactions stay inside one repository method** (`db.transaction(async (tx) => …)`), and `tx`
  never leaves it. If a use case needs two steps to be atomic, add one repository method that does both.
- **Workspace scoping is part of every query.** The service passes `workspaceId`, and the repository
  enforces it in every `WHERE`, including `UPDATE` and `DELETE`.
- **SQL that encodes a business rule** gets a named method. Tunable parameters are domain constants
  passed in.
- **pgvector and raw `sql`:** same ring, same rules. Raw fragments never leave the repository.
- **Schema and migrations:** change `src/db/schema/*`, then run `pnpm db:generate --name …`.
  Contracts, not the schema, are the source of truth for API shapes.

## SDK and CLI adapters (infrastructure)

**Ring:** driven adapters in `src/adapters/<port>/<vendor>.ts`, each implementing one port.

| Tool | Port | Adapter |
|---|---|---|
| `openai`, `@anthropic-ai/sdk`, OpenRouter | `LLMProvider` | `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts`, `reviewer-core` `OpenRouterProvider` |
| `openai` embeddings | `Embedder` | `adapters/embedder/openai.ts` |
| `octokit` | `GitHubClient` | `adapters/github/octokit.ts` |
| `simple-git` | `GitClient` | `adapters/git/simple-git.ts` |
| `@vscode/ripgrep` | `CodeIndex` | `adapters/codeindex/ripgrep.ts` |
| `@ast-grep/napi`, `dependency-cruiser`, `graphology`, `js-tiktoken` | `RepoIntel` facade + `DepGraph`, `Tokenizer` | `adapters/astgrep`, `adapters/depgraph`, `adapters/tokenizer`, behind `modules/repo-intel` |
| secrets file / env | `SecretsProvider` | `adapters/secrets/local.ts` |

Adding a tool, in order:
1. **The port, from the use case's point of view.** It goes in `modules/<m>/ports.ts`,
   `platform/ports/`, or the shared contracts, following the placement table in
   [layers-and-rules.md](layers-and-rules.md#designing-and-placing-ports).
2. **The adapter** in `src/adapters/<port>/<vendor>.ts`. It maps responses to contract types and wraps
   errors in `ExternalServiceError` (missing config → `ConfigError`).
3. **A mock** in `src/adapters/mocks.ts`.
4. **A container getter with a `ContainerOverrides` slot.** It reads keys via `SecretsProvider`, and
   returns a no-op or throws `ConfigError` when the key isn't configured.
5. **Consumption:** the module's `wiring.ts` passes it (or a resolver) to the service.

- **Resilience** (timeouts, retries) belongs in the adapter or the job runner, using the shared
  resilience helpers. Services don't sleep and retry.
- **Library complexity hides behind a facade.** Features never import `@ast-grep/napi` or
  `dependency-cruiser` directly.

## DI container (platform composition)

**What belongs in `platform/container.ts`:**

| Belongs | Doesn't belong |
|---|---|
| config, DB handle, job runner, run bus | module-local repositories and services (build them in `wiring.ts`) |
| external-tool adapters, each with a `ContainerOverrides` slot | per-feature flags or business constants |
| repositories for tables shared by several modules | anything that only one module uses |
| facades other modules consume (`repoIntel`) | business logic |

- **Who reads the container:** `wiring.ts`, route plugins (to call the builder and `getContext`), the
  platform bootstrap, and tests. **Not** services, repositories, domain code or adapters.
- **Adding a feature should not touch the container**, unless the feature brings a new external tool or
  offers a facade to other modules.
- **Legacy:** existing services take `Container`. Give new dependencies to them as explicit constructor
  options. See [layers-and-rules.md](layers-and-rules.md#legacy-code).

## Jobs, SSE, MCP tools and CI hooks (entry points)

All of these are driving adapters. They follow the same rule as routes: **parse, then make one service
call on a service built by wiring.**

- **Jobs:** register handlers in the module's `wiring.ts` (e.g. `registerConventionJobs`) or in the
  route plugin. Don't register them inside a service constructor. The handler parses the payload with a
  schema from `types.ts`. The job runner (`platform/jobs.ts`) is infrastructure: job rows, retry, timeout.
  Job kinds are `<X>_JOB_KIND = 'kebab-case'` constants. A use case that *enqueues* work gets a narrow
  dependency from wiring, such as `enqueue: (ws, payload) => c.jobs.enqueue(ws, KIND, payload)`. It
  doesn't get the job runner or the container.
- **SSE:** the bus (`RunBus` in `platform/sse.ts`) is infrastructure. A service gets a narrow `publish`
  function from wiring, typed with `RunEventKind` from the contracts. It never gets the bus class itself.
  The SSE route is presentation.
- **MCP tools, CI hooks, CLI commands:** a separate entry point (another process or package). It calls
  the same `build<Domain>Service` with a container built by its own bootstrap. It holds no queries and no
  rules, so the HTTP API and the MCP tool can't drift apart.
- **Run traces** are built by pure helpers and persisted by a repository. Reading a trace back is an
  edge: new fields stay optional.

## reviewer-core (pure domain-service library)

**Ring:** the whole package is an inner ring: domain services (prompt assembly, grounding, reduce,
scoring) plus one port, `LLMProvider`.

- **No DB, filesystem, GitHub, env or clock reads.** Everything comes in as function arguments. The
  only side effect is the injected `LLMProvider`.
- **The server calls it from the application ring** with inputs prepared by services and a provider
  resolved by composition.
- **Contracts come from the shared kernel** (`@devdigest/shared`); never redefine `Review`, `Finding` or
  `Verdict`.
- **`src/llm/` is the package's adapter area:** `OpenRouterProvider` plus its JSON-schema helpers
  (`structured.ts`, which uses `openai/helpers/zod`). It lives in the package so the CI runner can reuse it.
  Engine code outside `llm/` never imports it or any LLM SDK (`engine-no-vendor-sdk`). Only composition
  code uses the provider.
- **Public API = `src/index.ts`.** Never import deep paths.

## Config and secrets

- `loadConfig` (Zod-parsed env) runs in the platform bootstrap. Wiring passes values on as constructor
  arguments.
- Services never read `process.env`. Secrets are resolved through `SecretsProvider` when an adapter is
  built in the container.
- Business tunables (`MAX_*`, `DEFAULT_*`) are domain constants. Deployment knobs (URLs, ports, paths)
  are config.
