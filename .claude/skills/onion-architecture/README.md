# Onion Architecture Skill

**Version:** 2.1.0 · **Scope:** backend structure for `server/` (Fastify + Zod + Drizzle/Postgres + SDK
adapters) and `reviewer-core/` (pure engine). It covers structure only, not performance or API design.

## Motivation

The existing backend skills explain *how to use* each tool: `fastify-best-practices`,
`drizzle-orm-patterns`, `zod`, `postgresql-table-design`. None of them answers the structural questions
that come up on every backend task:

- Which ring does this file belong to, and what may it import?
- Where does a business rule go, if not into the route or the SQL?
- Where do SQL, SDK calls, validation, mapping, jobs, config and errors live?
- How is a new external tool added so that the core does not depend on it?
- Who constructs what, and how do services get their dependencies?
- How does a new feature stay inside its own folder?

The code was already halfway there: it had ports in `@devdigest/shared`, adapters with mocks, a DI
container and a pure `reviewer-core`. It also had drift: routes that query the DB, services that take the
whole container, schema imports in services. Course lessons L02–L08 add about 15 features as new modules,
so v2 also optimises for **few critical dependencies between features**:
- a feature changes its own folder;
- shared files change only for named reasons;
- the import check reports only what a change added.

## Positions taken (and why)

| Question | Position | Why |
|---|---|---|
| Which rings? | Domain → Application → Infrastructure / Presentation, plus composition | Palermo's four tenets; Clean Architecture's dependency rule; Microsoft's Application Core / Infrastructure / UI split |
| Folders per ring or flat files? | Flat module files mapped to rings; ring folders (`domain/`, `application/`, `infrastructure/`, `http/`) for big modules, also covered by the rules | Keeps `server/AGENTS.md` naming; Domain-Driven Hexagon and Graça allow the physical layout to vary as long as dependencies point inward |
| How is a file's ring decided? | By name or folder; **unrecognised files count as application code** (strictest) | v1 enumerated application files, so `types-internal.ts`, `domain/score.ts` or `_shared/x.ts` escaped every rule; a default-deny classification can't be bypassed by naming |
| Where are services and repositories built? | In the module's own `wiring.ts`; every entry point (routes, jobs, MCP tools, CI hooks) calls its builder | Seemann's composition root, applied per module (modular monolith: Grzybek's autonomy and Graça's "components don't reference each other"); v1's route-plugin wiring contradicted its own rule against routes importing repositories, and wiring couldn't be reused by L04's MCP entry point |
| What goes in the DI container? | Only cross-cutting things: config, DB, job runner, run bus, external-tool adapters, shared repositories, module facades | Registering every module repository there would make `container.ts` a file that every lesson edits (merge hotspot), and modules couldn't be deleted independently |
| Who owns interfaces? | The core (ports), shaped by the use case; one module → `ports.ts`, several modules on the server → `platform/ports/`, cross-package → shared contracts | Palermo tenet 2; Graça: ports fit the core's needs; keeps server-only ports out of the vendored client copy, which has already drifted |
| Cross-module use? | Only through the owner's `types.ts` facade, resolved via the container | Graça (no direct component references); the existing `RepoIntel` facade |
| Repositories? | Role-specific methods implementing a port, return rows/core types, transactions inside one method | Fowler's Repository; Stemmler's repository/mapper split; Drizzle transaction API |
| Separate entity classes and mappers for every table? | No entity layer. Ports and responses speak contract/module types; repositories map rows through pure mappers, which may import row types *type-only* | Uncle Bob says rows shouldn't cross boundaries, so they no longer cross the port. Domain-Driven Hexagon and Stemmler warn that a full entity layer is overkill for small apps |
| Repository types in the core? | No, not even `Pick<XRepository>`: depend on a port | Palermo tenet 2: the core defines interfaces and must not name their implementation |
| `platform/` | Split into core-safe files (errors, resilience, trace-builder, price-book, model-router, ports) and infrastructure/composition (jobs, sse, prompts, run-logger, config, container); services get contract-typed functions (`publish`, `enqueue`) | v2.0.0 left `platform/` unclassified, so a service could reach Drizzle (jobs), `process.env` (config) or the bus without any rule firing |
| `reviewer-core` | Engine code depends only on `LLMProvider`; `src/llm/` is the package's adapter area (OpenRouter + JSON-schema helpers that use `openai/helpers/zod`) | The engine's purity is now enforced (`engine-no-vendor-sdk`) instead of only claimed |
| Validation? | Parse once at each edge (routes, job payloads, MCP input, LLM output); the domain enforces invariants only | Alexis King, *Parse, don't validate*; fastify-type-provider-zod |
| Errors? | `AppError` taxonomy in the core; HTTP mapping in one handler | Domain-Driven Hexagon; existing `platform/errors.ts` |
| DI? | Constructor injection of narrow deps; the container is read only by composition | Seemann: Composition Root, Service Locator is an anti-pattern; now enforced by `application-no-container` |
| Legacy services? | New dependencies become explicit constructor options; no new `this.container.x` reads | The import baseline can't see a new read on a known edge, so the rule must be explicit |
| Rich vs anemic domain? | Business decisions in named pure functions; thin services | Fowler, *Anemic Domain Model* |
| How deep? | Ports only for external I/O or a real second implementation; plain CRUD stays thin | Palermo: Onion targets long-lived, behavior-rich apps; Graça's pragmatism note |
| Enforcement? | dependency-cruiser rules kept in the skill, run ad hoc **against a baseline** (`--output-type baseline` / `--ignore-known`); not in CI yet | Agents see only the violations their change added, with no hard-coded legacy count to go stale; lastminute.com rolls rules out per module |

## Conformance with Onion Architecture

- **Strict:** Palermo's tenets 2 (the core owns the interfaces) and 3 (coupling points to the center).
  Every ring, platform file, `_shared` and the engine has import rules.
- **Pragmatic:** tenet 1, because the center is the shared API contracts plus pure domain functions,
  with no separate entity model; and tenet 4, because the core runs without infrastructure but needs
  Drizzle's row types to compile, since the mappers import them type-only.
- **Other accepted trade-offs:** `AppError.statusCode` (an HTTP hint) in the core; multi-step atomic
  writes as one repository method instead of a Unit of Work; `repo-intel`'s facade exemption for its own
  adapters.

Details: `references/layers-and-rules.md` → "Conformance".

## File structure

```
onion-architecture/
├── SKILL.md                     # core rules, rings, change footprint, placement table, checklists (loaded on trigger)
├── README.md                    # this file (for humans; not loaded by the agent)
├── references/                  # loaded on demand, one level deep from SKILL.md
│   ├── layers-and-rules.md      # tenets, rings, classification, ports placement, boundaries, modules, wiring, legacy
│   ├── stack-rules.md           # Fastify, Zod, Drizzle/Postgres, SDK adapters, container, jobs/SSE/MCP, reviewer-core
│   ├── enforcement.md           # verified dependency-cruiser configs, baseline workflow, limits, legacy snapshot
│   ├── testing.md               # test type per ring; the buildApp()/dev-DB caveat
│   └── examples.md              # eight before → after refactors
└── evals/evals.json             # 4 evaluation scenarios
```

## How it was built (skill-authoring practices applied)

- **Researched first.** The backend stack was taken from `server/package.json`, `server/AGENTS.md`
  and `reviewer-core/AGENTS.md`. The current layering was read from `src/platform/container.ts`,
  `src/adapters/`, `src/vendor/shared/adapters.ts` and the module files. Then the Onion, Clean and
  Hexagonal sources and the tool docs below were read.
- **Frontmatter per the Agent Skills spec:** `name` matches the folder (lowercase, hyphens). The
  `description` is third-person, ≤ 1024 chars, with no XML. It states *what* and *when*, and includes
  trigger terms. The version goes in `metadata.version`, because `metadata` is a string→string map.
- **Concise SKILL.md** (well under 500 lines). It holds only the decisions Claude would not make by
  default, and defers tool APIs to the existing tool skills.
- **Progressive disclosure:** details are in `references/`, linked directly from SKILL.md (one level
  deep). Every reference file over 100 lines starts with a table of contents.
- **One default with an escape hatch**, not a menu of options.
- **Consistent terminology** (ring, port, driving/driven adapter, wiring, footprint), defined once.
- **Verifiable feedback loop:** a copyable checklist plus dependency-cruiser rules that were run against
  the real code and against synthetic good/bad modules, with a baseline workflow.
- **Evaluated:** v1.0.0 was run 3× with and 3× without the skill on each of 3 scenarios. The results are
  below. Their findings drove v2.
- **Repo-specific section kept short.** It maps rings to DevDigest paths and defers to the package
  `AGENTS.md` files for naming and commands.

## Evaluations: what they are and when to run them

`evals/evals.json` holds test scenarios for the skill itself: a prompt plus the behaviors a good answer
must show. Claude Code never runs them and never loads them into context. Run them by hand, following
the `skill-creator` workflow:
- one subagent per run, with the skill and without it;
- blinded grading of each `expected_behavior` with quoted evidence;
- aggregation into `benchmark.md`.

**When:**
- after any change to SKILL.md or the references;
- after switching models;
- when the code the skill describes changes shape, e.g. legacy modules get refactored.

Run several times per configuration: one run says little about an LLM.

v1.0.0 results (3 runs per configuration): with the skill 39/39 behaviors, without it 26/39.
- The baseline failures were systematic: services taking the whole `Container`, custom error classes
  instead of `ExternalServiceError`, and routes left with direct data access.
- The cost was +23% tokens and +26% time.
- The runs also exposed the v1 defects fixed in v2.0.0.

## Versioning

Semantic versioning in `metadata.version` (SKILL.md frontmatter):
- **major:** a changed default (e.g. where composition happens, ring folders mandatory, rows may no longer cross)
- **minor:** new rules, sections, references or enforcement rules
- **patch:** wording, examples, the legacy snapshot, fixes

### Changelog

- **2.1.0** (2026-10-15): closes the gaps found by a conformance review against Onion.
  - `platform/` is classified, with the new rule `application-no-platform-infrastructure`; services
    get contract-typed `publish`/`enqueue` functions instead of the bus or job runner.
  - Ports may not mention DB rows (`ports-are-contracts`); repositories map rows through `helpers.ts`.
  - Repository types are no longer allowed in application code (`application-no-repository` replaces
    `application-no-repository-construction`).
  - `repo-intel` is exempt only from the adapter rules.
  - `reviewer-core`: `src/llm/` is the adapter area; new rule `engine-no-vendor-sdk`.
  - Conformance section added (strict tenets 2 and 3, pragmatic 1 and 4); the legacy snapshot was
    regenerated (40 violations in 20 files).

- **2.0.0** (2026-10-15): optimised for few cross-feature dependencies.
  - **Changed default:** services and repositories are built in a per-module `wiring.ts`, not in the
    route plugin or the container.
  - **The container is limited** to cross-cutting things: external tools, shared repositories and facades.
  - **Change footprint table** added.
  - **Port placement** rules (module → `platform/ports/` → shared contracts).
  - **Rules for MCP/CI entry points and jobs** (register in wiring).
  - **Legacy-service rule** (explicit constructor options).
  - **Enforcement:**
    - default-deny file classification, which closes the prefix, subfolder and `_shared` holes;
    - fixed the false positive on `repository → ports`;
    - new rules `application-no-container`, `application-no-repository-construction`,
      `ports-are-contracts`, `wiring-uses-container-adapters`, `shared-kernel-is-thin`;
    - baseline / `--ignore-known` workflow;
    - a "limits of the check" section.
  - **Testing:** `buildApp()` is not DB-free (the boot reaper writes to `DATABASE_URL`).
  - **Examples:** consistent with the rules; new examples for legacy services and multi-entry-point wiring.
  - **Evals:** stronger assertions, plus a fourth scenario.
- **1.0.0** (2026-10-13): initial version.

## Sources

### Onion, Clean and Hexagonal architecture
- [The Onion Architecture: part 1 — Jeffrey Palermo](https://jeffreypalermo.com/blog/the-onion-architecture-part-1/): the original definition. Domain model at the center, interfaces in inner layers, coupling toward the center, infrastructure at the edge, scope (long-lived business apps).
- [The Onion Architecture: part 2 — Jeffrey Palermo](https://jeffreypalermo.com/blog/the-onion-architecture-part-2/): a worked example. Controllers depend on core interfaces, and implementations are injected at runtime.
- [The Onion Architecture: part 3 — Jeffrey Palermo](https://jeffreypalermo.com/blog/the-onion-architecture-part-3/): Onion vs traditional layering. The core depends on interfaces, not on data access.
- [Onion Architecture: Part 4 – After Four Years — Jeffrey Palermo](https://jeffreypalermo.com/blog/onion-architecture-part-4-after-four-years/): the four tenets and "the core can be compiled and run separate from infrastructure". Works with or without DDD or an IoC container.
- [The Clean Architecture — Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html): the dependency rule, crossing boundaries with DIP, and only simple data structures crossing.
- [Hexagonal (Ports & Adapters) Architecture — Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/): ports and adapters, running the app in isolation from devices and databases.
- [DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together — Herberto Graça](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/): primary/secondary adapters, ports shaped by core needs, application vs domain services, components that don't reference each other, a minimal shared kernel, pragmatism.
- [Common web application architectures — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures): Application Core / Infrastructure / UI contents, interfaces in the core, the composition root, testing the core in isolation.
- [Domain-Driven Hexagon — Sairyss](https://github.com/Sairyss/domain-driven-hexagon): a TypeScript/Node guide. Modules by domain, thin application services, ports by domain need, mappers, DTO whitelisting, no HTTP exceptions in the core, when abstraction is overkill.
- [Implementing the Onion Architecture in Node.js with TypeScript and InversifyJS — Remo H. Jansen](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad): Onion in a Node/TS stack with DI.
- [About hexagons and onions — jambit (PDF)](https://www.jambit.com/site/assets/files/17114/jambit-tp148-about-hexagons-and-onions_en.pdf): a short comparison. Outer layers may access inner ones, not vice versa.

### Dependency injection, composition and module autonomy
- [Modular Monolith: A Primer — Kamil Grzybek](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer): module independence depends on the number, strength and stability of dependencies; keep them few and loose; vertical slices so a feature change touches one module.
- [Composition Root — Mark Seemann](https://blog.ploeh.dk/2011/07/28/CompositionRoot/): one place near the entry point wires the graph. Only it references the container. Constructor injection everywhere else.
- [Service Locator is an Anti-Pattern — Mark Seemann](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern/): hidden dependencies, runtime failures, risky maintenance. This is the basis for "don't pass the container".

### Domain, persistence and validation
- [Anemic Domain Model — Martin Fowler](https://martinfowler.com/bliki/AnemicDomainModel.html): thin services, business rules in the domain.
- [Repository — Martin Fowler (PoEAA)](https://martinfowler.com/eaaCatalog/repository.html): a collection-like interface between the domain and data mapping.
- [Implementing DTOs, Mappers & the Repository Pattern — Khalil Stemmler](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/): repositories as ORM facades, toDomain/toPersistence/toDTO mappers, never returning raw ORM results.
- [Parse, don't validate — Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/): parse at the boundary into precise types and avoid shotgun parsing.

### Our stack
- [Encapsulation — Fastify](https://fastify.dev/docs/latest/Reference/Encapsulation/): plugin contexts, decorator visibility, `fastify-plugin` as a deliberate escape.
- [Type Providers — Fastify](https://fastify.dev/docs/latest/Reference/Type-Providers/): schema-driven route types (Zod provider).
- [Testing — Fastify](https://fastify.dev/docs/latest/Guides/Testing/): split the app builder from `listen`, `app.inject()`.
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod): `validatorCompiler` / `serializerCompiler`, response serialization by schema.
- [Transactions — Drizzle ORM](https://orm.drizzle.team/docs/transactions): `db.transaction(async (tx) => …)`, rollback, savepoints, Postgres options.
- [Goodies / Type API — Drizzle ORM](https://orm.drizzle.team/docs/goodies): `$inferSelect` / `$inferInsert` for row types.
- [Command line interface — dependency-cruiser](https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md): `--output-type baseline` and `--ignore-known` (known-violations baseline); `depcruise-baseline` is a deprecated alias.
- [Rules reference — dependency-cruiser](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md): `forbidden` rules, `path`/`pathNot`, `$1` group matching, `dependencyTypesNot: ['type-only']`, severities.
- [How we enforce architecture boundaries at scale — lastminute.com](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/): dependency-cruiser as a fitness function, rolled out per module.

### Skill authoring
- [Skill authoring best practices — Anthropic](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): conciseness, description rules, progressive disclosure, one-level references, TOC for long files, checklists, evaluations.
- [Agent Skills specification — agentskills.io](https://agentskills.io/specification): frontmatter fields and limits, `metadata.version`, directory layout, < 500-line guidance.
- [Equipping agents for the real world with Agent Skills — Anthropic Engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills): the metadata → SKILL.md → resources loading model.
