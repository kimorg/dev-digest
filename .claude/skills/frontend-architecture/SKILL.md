---
name: frontend-architecture
description: "Frontend architecture rules for React and Next.js apps: where components, hooks, constants, types, helpers, utils, API calls and business logic belong; how to split components and features; which way imports may point between shared code, features and routes. Use when creating, moving or naming files and folders, splitting a large component, deciding where new logic or a constant goes, adding a feature, choosing between a helper and a util, reviewing a PR for structure, or planning a refactor of a React or Next.js codebase. Trigger terms: folder structure, project structure, where to put, colocation, feature folders, feature-sliced, business logic, helpers, utils, constants, barrel files, index.ts, import boundaries. Covers architecture only, not performance."
metadata:
  version: "1.0.1"
  tags: "react, nextjs, frontend, architecture, project-structure, colocation"
---

# Frontend Architecture

Decision rules for **where code lives and how it is split** in a React / Next.js app. This skill covers
architecture only. For hook misuse and performance, see `react-best-practices`. For RSC boundaries and
Next.js file conventions, see `next-best-practices`.

Terms used throughout this skill:
- **shared**: code that any feature may use (`components/`, `hooks/`, `lib/`, `utils/`, `config/`, `types/`).
- **feature**: a business capability (`features/<name>/`, or a route segment in Next.js) that owns its UI, logic and data.
- **app**: the composition layer (routes, pages, layouts, providers) that wires features together.
- **helper**: a project-specific function (knows the domain). **util**: a generic, domain-free function you could copy to another project.
  Test: does the function mention a domain type or term (PR, run, finding, repo)? Yes means helper, no means util. Use the right word in names and explanations.

## Core principles

1. **Colocate by default.** Put code as close as possible to where it is used. Tests, styles, constants,
   types and hooks start next to the component that needs them.
2. **Things that change together live together.** Group by feature/domain, not by file type, once the app has
   more than a handful of screens.
3. **Promote on the second consumer, demote on the last.** Code moves *up* to a shared location only when a
   second, independent consumer appears. When only one consumer is left, it moves back down.
4. **Dependencies point one way: shared → features → app.** Shared code never imports a feature. Features
   never import other features. They are composed in app/routes.
5. **React is the view layer.** Business rules, calculations and data mapping are plain TypeScript that does
   not import React. Components render, hooks orchestrate, and domain functions decide.
6. **Avoid hasty abstractions.** Duplication is cheaper than the wrong abstraction. Abstract only once the
   copies show the shared shape. If an abstraction starts sprouting flags, inline it back.
7. **Deletion test.** Deleting a feature folder should break only the routes that compose it.
8. **Consistency over cleverness.** Follow the convention the codebase already uses. Change a convention
   deliberately and everywhere, never piecemeal.

## Where does X go?

| You are adding… | Put it… | Promote to… |
|---|---|---|
| UI used by one component | the same file (if tiny) or a sibling file in that component's folder | the feature's `components/` when a 2nd component in the feature uses it |
| UI used by one feature | `features/<f>/components/<Name>/` (Next.js: `app/<route>/_components/<Name>/`) | `components/` (shared) when a 2nd feature uses it |
| Generic, styled building block (Button, Dialog) | the UI kit / design-system folder (`components/ui/`) | — |
| Hook used by one component | the component folder (`use<X>.ts`) | `features/<f>/hooks/`, then `hooks/` |
| Constant used by one file | top of that file, above the component | `<Name>.constants.ts` / `constants.ts` in the folder |
| Constant shared within a feature | `features/<f>/constants.ts` (or `config.ts` for flags/options) | `config/` only if it is app-wide |
| Env vars, app-wide config | `config/` (one module that reads and validates `process.env`) | — |
| Design tokens (colors, breakpoints) | theme/tokens module or CSS variables, never scattered literals | — |
| Domain-specific function (format a PR status, compute a score) | **helper**: `<Name>.helpers.ts` → `features/<f>/helpers.ts` (or `model/`) | `helpers/` or `lib/<domain>.ts` |
| Generic function (clamp, groupBy, formatBytes) | **util**: starts colocated like any other code (`<Name>.helpers.ts`), or comes from a library you already depend on | `utils/` once a consumer outside its folder needs it. Being generic does not justify going shared early |
| Configured third-party wrapper (API client, query client, dayjs setup) | `lib/` | — |
| Business rules / calculations / API→UI mapping | pure functions or domain modules in the feature (`model/` or `domain/`) | entities layer (FSD) when several features share the same model |
| HTTP request + response schema + query hook | `features/<f>/api/` using the **single** API client from `lib/` | a shared `api/` only if many features call the same endpoint |
| Types used by one file | the same file | `<Name>.types.ts` → `features/<f>/types.ts` → `types/` |
| API contracts / DTO schemas | next to the API layer (or a shared contracts package), inferred from the schema | — |
| User-facing strings | the i18n message files, if the app has i18n | — |
| Test | next to the code (`<Name>.test.tsx`). End-to-end tests go in a top-level e2e folder | — |

Decide the state's **kind** before its location:

| State kind | Lives in |
|---|---|
| Server data (fetched) | a server-cache library (TanStack Query / SWR) behind a custom hook. Never copied into `useState` or a global store |
| Derivable value | computed during render, not stored |
| UI state for one component | `useState`/`useReducer` in that component |
| UI state for siblings | lifted to the closest common parent |
| Shareable / survives reload (filters, tab, page) | the URL (search params / route params) |
| Form state | a form library or controlled local state. Validation schema next to the form |
| Truly global UI (theme, current user, toasts) | context or a small store, split by concern, provided as low in the tree as works |

Details and rationale: [references/logic-placement.md](references/logic-placement.md).

## Splitting components

- **One job per component.** If you need "and" to describe it, split it. Each extracted part should have a
  name a teammate would understand.
- **Split when a piece has its own state, its own reason to change, or a second consumer.** Do not split
  just to hit a line count. Cohesive JSX can stay together.
- **No nested `renderX()` functions or components defined inside components.** Extract a real component.
- **Logic out, markup in.** Move effects and orchestration into a custom hook (`use<Feature><Thing>`), and
  calculations into pure functions. The component body reads as "get data → render".
- **Hooks replace container/presentational wrappers.** Do not add a container component whose only job is
  fetching. Call the data hook in the component that needs it, and keep leaf components prop-driven.
- **Composition before configuration.** Too many props or boolean modes mean the component should be
  composed with `children` or slots. Related parts that share state become a compound component
  (`Tabs`, `Tabs.List`, `Tabs.Panel`).
- **Composition before context.** Pass JSX as `children` to skip intermediate layers. Use context only when
  distant parts of the tree need the same value.
- **Wrap third-party UI** in your own component so the library can be swapped in one place.

Patterns and file anatomy: [references/component-design.md](references/component-design.md).

## Feature anatomy (default template)

```
features/<feature>/            # Next.js App Router: the route segment + its _components/, _lib/
├── components/                # feature UI; one folder per non-trivial component
│   └── PrRow/
│       ├── PrRow.tsx
│       ├── PrRow.test.tsx
│       ├── PrRow.helpers.ts   # only if needed
│       └── PrRow.constants.ts # only if needed
├── api/                       # requests, response schemas, query/mutation hooks
├── hooks/                     # feature hooks that are not data hooks
├── model/                     # business rules, mappers, pure functions (+ their tests)
├── constants.ts
└── types.ts
```

Create only the segments the feature needs. A feature with two files does not need five folders.

## Scaling path

1. **Small app:** `components/`, `hooks/`, `lib/`, `utils/` + routes. Colocate inside component folders.
2. **Growing app (default target):** add `features/`. Route files stay thin and compose features. Shared
   folders hold only code with 2+ consumers.
3. **Large app / many teams:** adopt Feature-Sliced Design layers (`shared → entities → features → widgets →
   pages → app`) when features keep needing each other's models, or when ownership must be enforced. Do not
   start here.

Layouts and the FSD mapping: [references/project-structure.md](references/project-structure.md).

## Imports and boundaries

- Import directly from the defining module. **Do not add internal barrel files** (`index.ts` that re-exports
  a folder). They cause cycles and slow dev builds.
- An `index.ts` is acceptable only as a deliberate, explicit public API of a feature or package (named
  exports, no `export *`), or as a one-line redirect to a component file when the codebase already does that.
- Use path aliases (`@/…`) across features, and relative imports inside one feature.
- Enforce direction with lint rules (`import/no-restricted-paths` or `eslint-plugin-boundaries`), not
  with reviews alone.

Configs and the barrel trade-offs: [references/boundaries-and-imports.md](references/boundaries-and-imports.md).

## Workflow: placing new code

Copy and tick:

```
Placement checklist:
- [ ] 1. Classify: component / hook / helper (domain) / util (generic) / constant / type / API call / domain rule / state
- [ ] 2. Count real consumers today (not "might reuse later")
- [ ] 3. Place at the lowest level that covers all consumers (table above)
- [ ] 4. If it's logic inside a component: move rules to a pure function, effects to a hook
- [ ] 5. Check import direction: no shared→feature, no feature→feature, no deep reach into another folder
- [ ] 6. Name it by the codebase's convention; add/move its test next to it
- [ ] 7. Delete what moved: no dead copies left in the old location
```

## Review checklist (structure)

When reviewing a PR or your own diff, flag:
- a component that fetches, transforms, and renders all in one body (split into hook + model + view)
- business rules in `useEffect`, event handlers or JSX conditionals instead of named functions
- server data copied into `useState` / a global store
- a new file in `utils/`, `components/` or `hooks/` (shared) with only one consumer
- a feature importing from another feature, or shared code importing from a feature
- a new `index.ts` that re-exports a whole folder
- magic numbers or strings repeated across files instead of a named constant
- a new abstraction with boolean/mode props that serves two unrelated callers

Worked refactors: [references/examples.md](references/examples.md).

## Applying in this repo (DevDigest `client/`)

`client/AGENTS.md` owns naming and file conventions and **wins on any conflict** with this skill. The
general rules map onto it like this:

| Concept in this skill | DevDigest location |
|---|---|
| route/feature-local UI | `src/app/**/_components/<Name>/` (with `constants.ts` · `helpers.ts` · `styles.ts` · test) |
| shared components | `src/components/<kebab-folder>/` |
| promoted helpers and utils (`utils/`, `helpers/`) | `src/lib/<kebab-name>.ts` (e.g. `format-cost.ts`). There is no `utils/` folder, so don't create one |
| UI kit primitives | `src/vendor/ui` (`@devdigest/ui`), so reuse these before writing new ones |
| API client + server-state hooks | `src/lib/api.ts` (the only HTTP client) + `src/lib/hooks/<domain>.ts` |
| API contracts | `src/vendor/shared` (Zod, vendored, so keep it in sync with the server copy) |
| user-facing strings | `messages/en/<namespace>.json` |

The component-folder `index.ts` (`export { X, X as default } from "./X"`) is this repo's convention. It
is a one-file redirect, not a folder barrel, so keep it.
