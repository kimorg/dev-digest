---
name: onion-architecture
description: "Onion Architecture rules for the TypeScript backend (Fastify, Zod, Drizzle ORM, Postgres, SDK adapters, DI container, pure engine packages): which ring each file belongs to, which way imports may point, how a feature module stays self-contained (its own wiring, ports and repositories), where business rules, use cases, SQL, external API calls, validation, mapping, jobs and errors live, and how to verify it with dependency-cruiser. Use when adding a backend module, endpoint, service, repository, port, adapter, background job, MCP tool or CI hook, when deciding where new backend logic goes, when a route or service grows, when reviewing a backend PR for structure, or when planning a backend refactor. Trigger terms: onion, clean architecture, hexagonal, ports and adapters, layers, dependency rule, wiring, composition root, dependency injection, service locator, repository, use case, where to put, coupling, new module. Covers structure only, not performance or API design."
metadata:
  version: "2.1.0"
  tags: "backend, architecture, onion, clean-architecture, ports-and-adapters, modular-monolith, fastify, drizzle, zod"
---

# Onion Architecture (backend)

Decision rules for **which ring backend code belongs to, which way it may depend, and how a feature
stays inside its own folder**. Tool APIs are covered by `fastify-best-practices`, `drizzle-orm-patterns`,
`zod` and `postgresql-table-design`. This skill decides *where* their code goes.

Terms used throughout:
- **ring**: one of the concentric layers below. Inner rings are more stable and know less.
- **domain**: business rules and types. Pure, no I/O.
- **application**: use cases (services) and the ports they need.
- **port**: an interface the core *needs* (`LLMProvider`, `ConventionStore`), owned by the core.
- **adapter**: code that talks to a tool. **Driving** adapters call the core (HTTP routes, job
  handlers, SSE, MCP tools, CI hooks). **Driven** adapters implement a port (Drizzle repositories,
  SDK wrappers).
- **wiring**: the module's composition file (`wiring.ts`). It builds the module's services from
  container-provided adapters and its own repositories.
- **footprint**: the files *outside* a module's folder that a feature has to touch.

## Core principles

1. **Dependencies point inward.** A file imports from its own ring or a ring closer to the center.
   An inner ring never names an outer one, not even as `import type`.
2. **A feature lives in its own folder.** A new module needs only its folder plus one registration line.
   Shared files change only for the reasons in [Change footprint](#change-footprint). This keeps
   features independent, avoids merge hotspots, and lets a module be deleted without breaking others.
3. **The core owns the ports.** Interfaces sit next to the code that needs them and are shaped by
   the use case, not copied from an SDK. Adapters implement them.
4. **Only plain data crosses a boundary.** Contracts, DTOs and plain objects cross rings. Framework
   objects, Drizzle builders and SDK responses never leave their adapter.
5. **Parse at the edge, trust inside.** Untrusted input is parsed once, in a driving adapter. The core
   enforces business invariants, not shapes.
6. **Errors are domain words.** The core throws `AppError` subclasses. One shared handler maps them
   to HTTP.
7. **Explicit dependencies, composition at the edge.** A service receives the narrow ports it uses.
   Only `wiring.ts` and the platform bootstrap read the DI container or construct classes. Handing
   the container to a service is a service locator: its real dependencies become invisible, and the
   rules can no longer check them.
8. **Pragmatic depth.** Add a file only when it holds something. CRUD can go route → service →
   repository with no domain file. Exception: external I/O is always behind a port.

## The rings

A module file's ring is decided by its **name or folder**. A file that matches no ring counts as
application code, the strictest default, so new files can't slip past the checks.

| Ring (inside → out) | Module files | May import | Must not import |
|---|---|---|---|
| **1. Domain** | `domain.ts`, `domain/**`, `constants.ts`, `types.ts` | its own module's domain files, the error taxonomy, shared contracts | everything else: framework, ORM, DB, adapters, SDKs, the container, other modules, `process.env` |
| **2. Application** | `service.ts`, `ports.ts`, `helpers.ts` (pure mappers), `application/**`, any other file | ring 1, ports, core-safe `platform/` files, row types (`import type`, not in ports) | framework, ORM, DB schema values, adapters, SDKs, the container, platform infrastructure (job runner, SSE bus, config, prompt files, run logger), repositories (even as types) |
| **3. Infrastructure** | `repository.ts`, `repository/**`, `infrastructure/**`; `src/adapters/**`; `src/db/**` | rings 1–2 (domain, ports, pure helpers) to implement ports | services, routes, wiring, the container, the framework |
| **4. Presentation** | `routes.ts`, `routes/**`, `http/**`; job handlers, SSE, MCP tools, CI hooks | services built by wiring, contracts, `_shared` request helpers | DB, ORM, repositories, adapters |
| **Composition** | `wiring.ts` per module; platform bootstrap (`app.ts`, `server.ts`, container, config, module registry) | everything in its own module + container-provided adapters | concrete adapters, ORM, schema (wiring only); business logic (all) |

**How strictly this follows Onion:**
- Tenets 2 and 3 are enforced strictly: the core owns the interfaces, and coupling points inward.
- Tenets 1 and 4 are pragmatic:
  - the center is built on the API contracts, not on a separate domain model;
  - row types may reach application mappers as types, so the core runs without Drizzle but doesn't
    compile without it.

The trade-offs are listed in the README. Details: [references/layers-and-rules.md](references/layers-and-rules.md).

## Change footprint

What a feature may touch **outside its own module folder**, and when:

| Shared file | Touch it only when… |
|---|---|
| module registry (`modules/index.ts`) | always: one import and one entry |
| DB schema + generated migration | the feature owns new tables or columns |
| shared contracts (both vendored copies) | a shape crosses the API to the client or into the pure engine |
| DI container | you add a **new external tool** (a new SDK, CLI or secret), or a **facade** that other modules consume |
| server-wide ports (`platform/ports/`) | a port is needed by two or more modules and is server-only |
| mocks file | you add an external-I/O port (its fake lives next to the other mocks) |
| another module | **never directly.** Use its facade interface (`types.ts`), resolved through the container |

A new module, repository, service, endpoint, job or MCP tool needs **no** container change.

## Where does X go?

| You are adding… | Put it in… |
|---|---|
| A business rule, calculation, status derivation, threshold | `domain.ts` (+ `constants.ts`): pure function + unit test |
| A use case | a method on `<Domain>Service` (`service.ts`), calling domain functions and ports |
| SQL / a transaction | the module's `repository.ts`, implementing a port from `ports.ts` and mapping rows to the port's types; the transaction stays inside one method |
| Publishing run events or enqueuing a job from a use case | a narrow, contract-typed function from wiring (`publish`, `enqueue`), not the bus or job runner |
| Construction of services and repositories | the module's `wiring.ts`: `build<Domain>Service(container)` |
| An HTTP endpoint | `routes.ts`: Zod schemas + a one-call handler on the service from wiring |
| A background job | register it in `wiring.ts` (or the route plugin); the handler parses the payload and calls a service method |
| An MCP tool, CI hook or CLI command | a driving adapter that calls the same `build<Domain>Service` and holds no logic of its own |
| A call to an external API, CLI or SDK | a port, then an adapter in `src/adapters/<port>/<vendor>.ts`, then a mock, then a container getter with an override slot |
| A port used by one module | `modules/<m>/ports.ts`, in contract/module types (never DB rows) |
| A port used by several modules (server only) | `src/platform/ports/<name>.ts` |
| A port that is part of the shared contracts (engine, client) | the shared contracts' ports file, in both vendored copies |
| Something another module needs from yours | a facade interface in your `types.ts`, implemented by your service and registered in the container |
| Row → API DTO mapping | `helpers.ts` (`to<X>Dto`), pure |
| Config or env | the config loader, passed in through wiring; the core never reads `process.env` |
| A new error case | an `AppError` subclass with a snake_case `code` |
| Prompt assembly, grounding, scoring | the pure engine package (`reviewer-core`) |

## Tool rules (summary)

- **Fastify**: a route plugin gets its service from `wiring.ts`. A handler reads the request context,
  calls one service method and returns. No SQL, SDK calls or business `if`s.
- **Zod**: shared contracts are the shared kernel, usable as types in any ring. Parsing (`schema.body`,
  `.parse` of job payloads and LLM output) happens only at the edges.
- **Drizzle / Postgres**: only repositories and DB plumbing import `drizzle-orm` and the schema. Ports
  and responses never mention rows. A repository maps rows to the port's types through pure mappers in
  `helpers.ts`. Those mappers may import row types with `import type`.
- **SDKs**: one port per tool. Adapters translate shapes into contract types and errors into
  `ExternalServiceError` / `ConfigError`.
- **DI container**: it holds config, the DB, the job runner and run bus, external-tool adapters, and
  cross-module facades. **Module-local repositories and services don't belong there.**
- **Pure engine package**: no DB, filesystem, network or env, and no LLM SDK outside its `llm/` adapter
  area. Everything comes in as arguments or through its one port.

Per-tool details and snippets: [references/stack-rules.md](references/stack-rules.md).

## Module anatomy (default template)

```
modules/<name>/
├── routes.ts      # 4  presentation: Zod schemas + one-call handlers
├── wiring.ts      # ·  composition: build<Domain>Service(container), job registration
├── service.ts     # 2  application: use cases
├── ports.ts       # 2  application: interfaces this module needs
├── helpers.ts     # 2  application: pure row → DTO mappers
├── domain.ts      # 1  domain: pure rules
├── constants.ts   # 1  domain
├── types.ts       # 1  domain: module types + the facade other modules may use
└── repository.ts  # 3  infrastructure: Drizzle, implements a port
```

Create only the files the module needs. Growth path:
1. Split a big repository into `repository/<aggregate>.repo.ts`.
2. Split a big service into one file per use case (`application/<use-case>.ts`, or next to `service.ts`).
3. Only for big modules, move to ring folders (`domain/`, `application/`, `infrastructure/`, `http/`).
   The rules classify those folders too.

## Workflow: placing new backend code

Copy and tick:

```
Onion checklist:
- [ ] 1. Before editing: save a dependency-cruiser baseline (references/enforcement.md)
- [ ] 2. Classify the code: rule / use case / query / external call / validation / mapping / wiring / entry point
- [ ] 3. Pick its file from "Where does X go?"; keep the footprint to the "Change footprint" table
- [ ] 4. External I/O → port + adapter + mock + container getter with an override slot
- [ ] 5. Build services in wiring.ts with explicit, narrow dependencies; services never see the container
- [ ] 6. Boundaries: responses are contract-shaped; no rows, SDK objects or builders leak out
- [ ] 7. Tests at the right level (references/testing.md)
- [ ] 8. After editing: run the check against the baseline; every new violation is fixed or explained
```

## Review checklist (structure)

Flag in a PR or your own diff:
- a handler or MCP tool that queries the DB, calls an adapter, or contains a business condition
- business decisions in a route, repository or adapter instead of a named domain function
- a service or domain file importing the framework, `drizzle-orm`, a schema value, an SDK, `process.env`, the container, the job runner, the SSE bus, the config loader or a repository (even its type)
- a service that constructs its own repository or adapter, or a new constructor that takes the container
- a module importing another module's files other than its `types.ts` facade
- a container change for something module-local (a repository, a service)
- a port that names its implementation, a DB row or a vendor type
- a raw row, SDK response or Drizzle builder returned past its layer
- HTTP status handling inside a service instead of an `AppError` subclass
- external I/O without a mock, which forces the unit lane onto the network
- **new usages on a known legacy edge** (e.g. one more `this.container.x` read in a legacy service). The baseline can't see these.

Refactors: [references/examples.md](references/examples.md) · tests per ring:
[references/testing.md](references/testing.md) · rules and baseline: [references/enforcement.md](references/enforcement.md).

## Applying in this repo (DevDigest `server/` + `reviewer-core/`)

`server/AGENTS.md` and `reviewer-core/AGENTS.md` own naming and commands and **win on any conflict**.

| Ring | DevDigest location |
|---|---|
| Domain | `modules/<m>/{domain,constants,types}.ts` · `@devdigest/shared` contracts (`server/src/vendor/shared`) · `reviewer-core/src` (pure, only port `LLMProvider`) |
| Application | `modules/<m>/{service,ports,helpers}.ts` + other module files · core-safe platform: `platform/errors.ts` · `platform/ports/` · `resilience.ts` · `trace-builder.ts` · `price-book.ts` · `model-router.ts` |
| Infrastructure | `modules/<m>/repository*` · `src/adapters/<port>/<vendor>.ts` · `src/db/*` · `platform/jobs.ts` · `platform/sse.ts` · `platform/prompts.ts` · `platform/run-logger.ts` · `reviewer-core/src/llm/` |
| Presentation | `modules/<m>/routes.ts` · `modules/_shared/{context,schemas}.ts` · job handlers · SSE routes |
| Composition | `modules/<m>/wiring.ts` · `src/app.ts` · `src/server.ts` · `platform/container.ts` (+ `ContainerOverrides`) · `platform/config.ts` · `modules/index.ts` |

- Repo intelligence is reached only through the `RepoIntel` facade (`modules/repo-intel/types.ts`),
  resolved as `container.repoIntel`. It is the model for any cross-module capability.
- Row types: `import type { XRow } from '../../db/rows.js'`. Add a missing `XRow` there instead of
  writing `typeof schema.x.$inferSelect`.
- Booting the app (`buildApp()`) connects to `DATABASE_URL` and reaps `running` runs. See
  [references/testing.md](references/testing.md) before writing a test that builds the app.
- **Legacy:** some modules predate these rules. Routes query the DB, services take `Container`, and
  services register jobs and build their own repositories. New code follows the rules. When you add to
  a legacy service, add the new dependency as an **explicit constructor option**. Don't add a
  `this.container.x` read. Refactor legacy code only when the task is in that area. The baseline in
  [references/enforcement.md](references/enforcement.md) keeps the list of known violations current.
