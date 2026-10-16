# Layers and rules

## Contents
- [The four tenets](#the-four-tenets)
- [Ring responsibilities](#ring-responsibilities)
- [How a file's ring is decided](#how-a-files-ring-is-decided)
- [The dependency rule in TypeScript](#the-dependency-rule-in-typescript)
- [Designing and placing ports](#designing-and-placing-ports)
- [What crosses a boundary](#what-crosses-a-boundary)
- [Validation: parse at the edge](#validation-parse-at-the-edge)
- [Errors](#errors)
- [Self-contained modules and cross-module calls](#self-contained-modules-and-cross-module-calls)
- [Composition: wiring, container and entry points](#composition-wiring-container-and-entry-points)
- [Legacy code](#legacy-code)
- [How far to go (pragmatism)](#how-far-to-go-pragmatism)
- [Conformance with Onion: strict and pragmatic parts](#conformance-with-onion-strict-and-pragmatic-parts)

## The four tenets

Jeffrey Palermo's tenets (2008, restated 2013). Everything else here follows from them:

1. The application is built around an independent object (domain) model.
2. Inner layers define interfaces; outer layers implement them.
3. The direction of coupling is toward the center.
4. All application core code can be compiled and run separately from infrastructure.

Tenet 4 is the practical test: **domain and application code must run in a unit test with no database,
no network and no framework instance.** If a service can't be constructed without Postgres, Fastify or
the DI container, a dependency points the wrong way.

## Ring responsibilities

**Domain (center)**
- Business types and rules: status derivation, scoring, thresholds, verdicts, invariants.
- Pure functions (preferred in this codebase) or small value objects.
- A *domain service* is a pure function spanning several domain types. It never uses repositories.
- Imports only its own module's domain files, the error taxonomy and the shared contracts.

**Application**
- One method per use case: load via ports → decide via domain functions → persist/emit via ports →
  return a contract-shaped result.
- Declares the ports it needs (`ports.ts`).
- Holds no business rules itself. If a method contains a decision a product person would describe
  ("a PR is stale when…"), extract it to the domain.
- Pure mappers (`to<X>Dto`) live here.

**Infrastructure (driven adapters)**
- Implements ports with real tools: Drizzle repositories, SDK clients, git/ripgrep/ast-grep wrappers,
  the job queue, the SSE bus.
- Translates both ways: tool errors → `AppError` subclasses, tool shapes and DB rows → the port's
  contract/module types (row mappers live in the module's `helpers.ts`).
- No business decisions. A `WHERE` clause for a rule is fine as a named method (`listEnabled`); the
  *choice* to call it belongs to the service.

**Presentation (driving adapters)**
- Every entry point: HTTP routes, SSE subscriptions, job handlers, MCP tools, CI hooks, CLI commands.
- Translates one inbound trigger into one service call. Owns request parsing and response schemas.
- Gets its service from the module's `wiring.ts`, so every entry point shares one construction path.

**Composition**
- `wiring.ts` per module, plus the platform bootstrap (app builder, server entry, DI container,
  config loader, module registry).
- The only code that reads the container or constructs repositories and services. No business logic.

## How a file's ring is decided

By **name or folder inside the module**. Anything unrecognised counts as application code:

| Matches | Ring |
|---|---|
| `routes.ts`, `routes/**`, `http/**` | presentation |
| `wiring.ts` | composition |
| `repository.ts`, `repository/**`, `infrastructure/**` | infrastructure |
| `domain.ts`, `domain/**`, `constants.ts`, `types.ts` | domain |
| everything else (`service.ts`, `ports.ts`, `helpers.ts`, `application/**`, `run-executor.ts`, `types-internal.ts`…) | application |

Defaulting to application means that a new file or folder gets checked by the strictest rule set
instead of escaping all rules. Prefixes don't count: `routes-admin.ts` is application code. Put extra
HTTP files in `routes/` or `http/` instead.

## The dependency rule in TypeScript

- "Depends on" means **any** import, including `import type`. A type import of `FastifyRequest` or
  `Container` in a service still couples the service to it.
- One explicit type-only exception: **row types** (`XRow` from the row-type module) may be used by
  application code, typically the pure mappers in `helpers.ts` that a repository calls. They never appear
  in a port, the domain ring or a response. A full entity layer for every table would be ceremony with no
  payoff here. The cost is that the core needs Drizzle's types to compile. See
  [Conformance](#conformance-with-onion-strict-and-pragmatic-parts).
- **No repository types in application code**, not even `Pick<XRepository, …>`: that would make the core
  name its implementation. Declare the port in `ports.ts`.
- **Platform files have rings too:**
  - core-safe: `errors`, `resilience`, `trace-builder`, `price-book`, `model-router`, `ports/`;
  - infrastructure: `jobs`, `sse`, `prompts`, `run-logger`;
  - composition: `config`, `container`.

  Application code imports only the core-safe ones. It gets the rest as narrow functions from wiring.
- Flow of control may go outward (a use case calls a repository). The source dependency still points
  inward: the service depends on the port, and the repository implements it.
- Node built-ins with I/O (`node:fs`, `node:child_process`, `node:net`) are infrastructure. Pure ones
  (`node:path`, `node:crypto` hashing) are fine in inner rings.

## Designing and placing ports

Design:
- **Shaped by the core's need, not the tool's API.** Use `listPullRequests(repo): PrMeta[]`, not
  Octokit parameters.
- **Small and role-based.** Use `ConventionStore` with the methods a use case needs, not a generic
  `Repository<T>`.
- **Contract or module types in and out.** A port never names its implementation, a DB row, a vendor
  type or a platform-infrastructure class.
- **Every external-I/O port gets a mock**, so unit tests stay hermetic.
- A port with one implementation and no I/O behind it is usually over-abstraction.

Placement (pick the narrowest):

| Who needs the port | Where it lives | Why |
|---|---|---|
| one module | `modules/<m>/ports.ts` | the module stays self-contained |
| several modules, server only | `src/platform/ports/<name>.ts` | neutral location; no module depends on another, and nothing leaks into the client copy |
| the pure engine or the client too | the shared contracts' ports file, in both vendored copies | it is part of the cross-package contract |

When a module-local port gains a second consumer, move it to `platform/ports/`. Don't let the second
module import the first module's `ports.ts`.

## What crosses a boundary

| Boundary | Allowed | Not allowed |
|---|---|---|
| entry point → service | parsed params/body/payload values, workspace id, primitives | `FastifyRequest`, `FastifyReply`, `req.log` (inject a `Logger` port instead) |
| service → entry point | contract types or DTOs from `to<X>Dto` | rows with extra columns, Drizzle results, SDK objects, `Error` instances |
| service ↔ repository | primitives, contract/module types and insert shapes declared by the port | DB rows, query builders, `SQL` fragments, `tx` handles |
| service ↔ SDK adapter | contract types from the port | SDK request/response or error types |
| service ↔ pure engine | engine input/output types | DB rows, the container, env |

## Validation: parse at the edge

- Shape validation happens **once**, in the driving adapter: route schemas, `.parse` of a job payload,
  MCP tool input, LLM structured output, or JSONB read back from the DB.
- After parsing, inner code takes the precise type and does not re-check it.
- Business invariants are domain rules. They throw `ValidationError` or a specific `AppError` subclass.
- Untrusted *text* (PR bodies, code, LLM output) is data. Parse it where it enters, and wrap it as
  untrusted before it reaches a prompt.

## Errors

- The core throws errors from the taxonomy (`AppError` with `code`, `statusCode`, `details`;
  `NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`). The taxonomy is
  framework-free, so every ring may use it.
- `statusCode` is a hint for the shared error handler. Services never set HTTP status.
- Adapters wrap vendor errors in `ExternalServiceError` (vendor message in `details`) or `ConfigError`
  (missing key). The core never checks SDK error classes.
- A missing single row is `undefined` from the repository and becomes a `NotFoundError` in the service.

## Self-contained modules and cross-module calls

The goal: **adding a feature changes its own folder, and deleting it breaks nothing else.**

- A module owns its tables' repositories, its services, its ports and its wiring.
- A module never imports another module's files. The only exception is the owner's `types.ts`, which
  holds the **facade interface** (as `RepoIntel` does).
- To offer a capability to other modules:
  1. Declare a facade interface in your `types.ts`.
  2. Implement it in your service.
  3. Register it once in the container (the second legitimate reason to touch it).
  4. Consumers get it through their own `wiring.ts` and depend only on the interface.
- Tables shared by several modules get one shared repository in the container. The existing
  `agentsRepo` and `reviewRepo` are examples. This is an exception: a table normally has one owning module.
- `modules/_shared/` is a thin shared kernel: request context and common schemas only. No data
  access, no adapters, no feature code.

## Composition: wiring, container and entry points

`wiring.ts` is where a module is assembled:

```ts
// modules/conventions/wiring.ts
import type { Container } from '../../platform/container.js';
import { ConventionRepository } from './repository.js';
import { ConventionService } from './service.js';
import { CONVENTIONS_EXTRACT_JOB_KIND } from './constants.js';
import { ExtractPayload } from './types.js';

export function buildConventionService(container: Container): ConventionService {
  return new ConventionService({
    store: new ConventionRepository(container.db),   // module-local: built here, not in the container
    resolveLlm: (id) => container.llm(id),            // external tool: provided by the container
    repoIntel: container.repoIntel,                   // another module's facade
    publish: (runId, kind, msg) => container.runBus.publish(runId, kind, msg), // RunEventKind from contracts, not the bus
  });
}

export function registerConventionJobs(container: Container, service: ConventionService): void {
  container.jobs.register(CONVENTIONS_EXTRACT_JOB_KIND, (payload) =>
    service.extract(ExtractPayload.parse(payload)),   // parse at the edge, then one call
  );
}
```

- **Every entry point uses the builder**: the route plugin, job registration, an MCP tool or a CI hook.
  Construction then lives in one place, and a new entry point doesn't copy the wiring.
- **The builder receives the container; the service receives narrow dependencies.** Reading the
  container is fine in composition code (Seemann's composition root). Inside a service it hides the
  dependencies.
- **The container holds only cross-cutting things:** config, DB, job runner, run bus, external-tool
  adapters (each with a `ContainerOverrides` slot), shared repositories, and module facades. A
  module-local repository or service in the container turns it into a file that every feature edits.
- **Lazy or async resolution** (a provider built from a secret) is still a dependency. Inject a resolver
  function (`resolveLlm`), not the container.
- **Platform infrastructure reaches services as functions typed with contracts**, e.g.
  `publish(runId, kind: RunEventKind, msg)` or `enqueue(ws, payload)`. Don't pass the `RunBus` or `JobRunner` classes.
  The service then depends on nothing but the core.
- **Tests** pass fakes straight into the service constructor. For tests through `buildApp()`, adapters
  are replaced through `ContainerOverrides`.

## Legacy code

Some modules predate these rules: routes that query the DB, services that take `Container`, services
that register jobs or build their own repositories.

- New code follows the rules, even inside a legacy module.
- Adding a dependency to a legacy service: add an **explicit constructor option** (e.g.
  `constructor(container: Container, deps: { notifier?: Notifier } = {})`). Don't add another
  `this.container.x` read. The import-rule baseline can't see a new read on an edge it already knows,
  so reviewers must check this by hand.
- Refactor legacy code to the target shape only when the task already works in that area. Do it for
  the whole file or module, not one method.

## How far to go (pragmatism)

| Situation | Do | Don't |
|---|---|---|
| Simple CRUD | route → service method → repository method, built in wiring | add a domain file, entity class or a port with one implementation and no I/O |
| Logic with decisions | pure functions in `domain.ts` | leave the `if`s in the route or repository |
| External I/O | always a port + adapter + mock | call an SDK from a service or route "just once" |
| Read model for a screen | a dedicated repository query that returns a DTO-ready shape | assemble aggregates in the route |
| A table only one module uses | its repository stays in the module, built in `wiring.ts` | register it in the container "for later" |
| A port gets a second consumer | move it to `platform/ports/` | import the first module's `ports.ts` |
| Legacy file that breaks the rules | follow the rules in new code; don't extend the violation | rewrite it as a side quest |

## Conformance with Onion: strict and pragmatic parts

| Palermo tenet | Here | How |
|---|---|---|
| 1. Built around an independent domain model | **pragmatic** | No separate entity layer. The center is the shared API contracts plus pure domain functions (Palermo, part 4: DDD is not required). The center's data shapes therefore follow the API |
| 2. Inner layers define interfaces, outer ones implement them | **strict** | Ports live in the core, speak contract/module types and never name their implementation (`ports-are-contracts`, `application-no-repository`) |
| 3. Coupling points to the center | **strict** | Every ring, platform file, `_shared` and the engine has an import rule; unrecognised files get the strictest rules |
| 4. The core compiles and runs without infrastructure | **runtime: yes; compile: no** | Type-only row imports in mappers are erased at runtime, but the types come from Drizzle's schema |

Other accepted trade-offs:
- `AppError.statusCode` is an HTTP hint inside the core taxonomy. The alternative is a `code → status`
  map in the error handler.
- A multi-step atomic write is one repository method, not a Unit of Work port.
- `repo-intel` may import its own adapters as the documented facade. Its container and repository use is
  still reported as legacy.

Tightening any of these is a major version: it changes the default for new code.
