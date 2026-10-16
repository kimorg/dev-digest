# Testing per ring

The onion pays off in tests: the inner rings run with no Docker, network, framework or container. Test
each ring at its own level. Lane rules (unit vs `*.it.test.ts`) come from `TESTING.md` and
`server/AGENTS.md`.

| Ring | Test type | Needs | Example in repo |
|---|---|---|---|
| Domain (`domain.ts`, pure helpers, `reviewer-core`) | plain unit test: input → output | nothing | `test/reviews-helpers.test.ts`, `test/grounding.test.ts`, `test/pulls-status.test.ts` |
| Application (`service.ts`) | unit test with fake ports passed to the constructor | in-test fakes or mocks from `src/adapters/mocks.ts` | `test/repo-intel-facade-degraded.test.ts` |
| Infrastructure: repository | integration test against real Postgres that calls the repository directly | `startPg()` from `test/helpers/pg.ts`, file named `*.it.test.ts` | `test/agents-versions.it.test.ts`, `test/reviews.it.test.ts` |
| Infrastructure: SDK adapter | unit test of the adapter's pure parts (mapping, error wrapping) with the SDK/HTTP stubbed | nothing; no real network | `test/adapters.test.ts` |
| Composition (`wiring.ts`) | covered by route/integration tests; no separate test unless it holds logic (it shouldn't) | — | — |
| Presentation (routes) | `app.inject()` through `buildApp({ config, overrides })` | see the warning below | `test/routes-smoke.test.ts`, `*.it.test.ts` route suites |
| Architecture | dependency-cruiser against a baseline | `pnpm exec depcruise …` | [enforcement.md](enforcement.md) |

**Warning: `buildApp()` is not DB-free.** On boot it awaits a reaper that runs
`UPDATE agent_runs SET status='failed' WHERE status='running'` against `DATABASE_URL`. The config loader
reads `.env`, and the default URL is the local dev DB. A test that builds the app therefore:
- connects to your running dev Postgres, if there is one, and fails every in-flight review run there;
- only logs `stale-run reaping failed (non-fatal)` when no DB is reachable.

So:
- **Prefer testing rules and use cases below the app**, with domain and service unit tests. Route tests
  should only check wiring, the schema and the error envelope.
- Don't run the unit lane while a review is running locally.
- Don't add new route tests to the unit lane on the assumption that they are hermetic. If a test needs
  the DB, it is `*.it.test.ts` (with `startPg()`).

Rules:
- **Push assertions inward.** A business rule is tested once, as a pure function, with all its edge cases.
- **Service tests use fakes for ports, never Postgres or the container.** Explicit constructor
  dependencies make fakes trivial:
  ```ts
  const service = new ConventionService({
    store: { list: async () => [{ id: 'c1', name: 'no default exports' }] },  // port types, not rows
    resolveLlm: async () => new MockLLMProvider({ /* … */ }),
  });
  ```
  A service that needs Postgres or a whole `Container` to be tested has a dependency pointing the
  wrong way. Fix the dependency instead of adding Docker.
- **Every new external-I/O port gets a mock** (in `src/adapters/mocks.ts`, or an in-test fake for
  module-local ports), plus a `ContainerOverrides` slot when the container builds it.
- **Repository tests prove the SQL**, including workspace scoping and ordering. Set `createdAt`
  explicitly when order matters, because rows from one multi-row insert share `now()`.
- **Anything that touches Postgres is `*.it.test.ts`**, so the unit lane stays hermetic.
- **reviewer-core:** `npm test` with a stubbed `LLMProvider`, then `pnpm typecheck` in `server/`.
