# Logic placement

## Contents
- Decision order
- Business / domain logic
- Hooks
- Helpers vs utils
- Constants and configuration
- Types
- API layer
- State by kind
- Where logic runs: render, handler, effect

## Decision order

For any new piece of logic, ask in this order:
1. **Can it be derived from existing props/state?** Then compute it during render (or in a model function). Do not store it.
2. **Is it a rule, calculation or mapping?** Then it is a pure function in the model/helpers, with no React.
3. **Does it hold state or synchronize with something external?** Then it is a custom hook.
4. **Does it talk to the server?** Then it is the API layer plus a server-cache hook.
5. **Is it only markup?** Then it is a component.

Then place it at the lowest folder that covers every current consumer.

## Business / domain logic

- Business rules are plain TypeScript functions or small modules, with no React import. They are testable
  without rendering and reusable from any view (or the server).
- Location: the feature's `model/` (or `domain/`, or `<feature>.helpers.ts` for small features). In FSD,
  shared models go in `entities/<x>/model`.
- Name rules after the business question: `isMergeBlocked(pr)`, `scoreFindings(findings)`, `nextRetryAt(run)`.
- When variant branches (`if (country === …)`, `if (provider === …)`) spread across views and hooks,
  replace them with a strategy object or map in one module, so a new variant touches one file.
- Validation schemas (e.g. Zod) are domain logic. They live next to the model or API contract they
  validate and are reused by forms and the API layer.

## Hooks

- Extract a custom hook when stateful logic (state + effects) is repeated, or when an effect would
  otherwise sit in a component. Hide effects behind a well-named hook.
- Name hooks after a concrete use case: `useReviewRuns(prId)`, `useOnlineStatus()`, `useMediaQuery(q)`.
  Avoid generic lifecycle wrappers (`useMount`, `useEffectOnce`, `useUpdateEffect`).
- Use the `use` prefix **only** for functions that call hooks. A function that calls no hooks is a
  helper or util (`getSorted`, not `useSorted`).
- Hooks share stateful *logic*, not state. Each call has its own state. To share state, lift it or use
  context / a server cache.
- Placement: component folder → `features/<f>/hooks/` → shared `hooks/` (2+ features).
- A hook orchestrates. It calls model functions for calculations instead of inlining them.

## Helpers vs utils

| | Helper | Util |
|---|---|---|
| Knows the domain? | yes (PR, run, finding, repo) | no |
| Example | `formatRunStatus(run)`, `severityOrder(finding)` | `clamp`, `groupBy`, `formatBytes`, `sleep` |
| Starts in | `<Name>.helpers.ts` next to the component | — |
| Promotes to | `features/<f>/helpers.ts` / `model/`, then a shared `helpers/` or `lib/<domain>.ts` | `utils/` (organized by topic: `utils/date.ts`, `utils/array.ts`) |

- Before writing a util, check whether the standard library or an existing dependency already does it.
- A `utils/` file must not import from features or know domain types. If it does, it is a helper in
  the wrong place.
- Do not let a single `utils.ts` or `helpers.ts` grow into a junk drawer. Split it by topic once it covers
  several unrelated concerns.

## Constants and configuration

| Kind | Location |
|---|---|
| Used in one file | top of that file, `SCREAMING_SNAKE_CASE` |
| Used by one component and its companions | `<Name>.constants.ts` / `constants.ts` in the component folder |
| Feature-wide (limits, option lists, route paths of the feature) | `features/<f>/constants.ts` |
| App-wide behaviour (page sizes, feature flags) | `config/` |
| Environment variables | one `config/env.ts` that reads, validates (schema) and exports typed values. Nothing else reads `process.env` directly |
| Design tokens | the theme/tokens module or CSS variables |
| User-facing text | i18n message files (when the app has i18n), not constants |
| Query keys | a key factory per feature, next to its query hooks |

- Name constants after meaning (`MAX_COMMENTS_PER_FILE`), not value (`FIFTY`).
- Prefer `as const` objects or union types over loose string literals scattered in code.
- Do not create a global `constants.ts` that mixes unrelated domains. Constants follow the same
  colocate-then-promote rule as everything else.

## Types

- Colocate: a type lives in the file that defines the thing it describes (props next to the component, return
  type next to the function).
- Promote: `<Name>.types.ts` → `features/<f>/types.ts` → shared `types/` only for cross-feature types.
- Infer instead of duplicating: `z.infer<typeof schema>`, `ReturnType<…>`, `ComponentProps<typeof X>`.
- API types come from the contract or schema in one place. UI-specific view models are separate types
  produced by mappers in the API or model layer.

## API layer

- **One configured API client** in `lib/` (base URL, auth, error normalization). Components never call
  `fetch` / `axios` directly.
- **Per endpoint, keep together:** request function, request/response schema or types, the
  query/mutation hook, and its query keys. Location: `features/<f>/api/`. Move it to a shared `api/` only
  when many features call it.
- Map API responses to domain types at this boundary (anti-corruption layer).
- Export hooks from the API module. Components consume `useX()` and never touch keys or fetchers.
- Query keys: arrays ordered from generic to specific (`["reviews", "list", { prId }]`), produced by a
  per-feature factory, and reused for invalidation.

## State by kind

| Kind | Tool / place | Rule |
|---|---|---|
| Server cache | TanStack Query / SWR behind custom hooks | the cache is the source of truth, so don't sync it into other state |
| Local UI | `useState` / `useReducer` | start here; lift only when a sibling needs it |
| Shared UI (siblings) | the closest common parent | lift state up, pass setters as `on…` props |
| Distant UI (theme, auth user, toasts) | context (+ reducer) or a small store, split by concern | provider as low as possible |
| Shareable / reload-safe | URL search/route params | filters, tabs, pagination, selected item |
| Form | form library or controlled state + schema | wrap the library in your own field components |

State structure: group values that change together, avoid contradictory booleans (use a `status` union),
avoid redundant/derived state, store IDs instead of duplicated objects, and keep state flat.

## Where logic runs: render, handler, effect

| Logic is… | Runs in |
|---|---|
| derived from props/state | render (or a model function called during render) |
| caused by a user action (submit, click, POST) | the event handler |
| caused by the component being shown (subscription, analytics view) | an effect, ideally inside a custom hook |
| syncing with an external system | an effect with cleanup, or `useSyncExternalStore` |
| once per app load | the entry module / root provider, not an arbitrary component |

Notifying a parent goes in the same handler that changes the state, not in an effect. Resetting state when
an identity changes uses `key`, not an effect.
