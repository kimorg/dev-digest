# Project structure

## Contents
- Choosing a level
- Level 1: small app
- Level 2: feature-based (default)
- Level 3: Feature-Sliced Design
- Next.js App Router variants
- Naming conventions
- Anti-patterns

## Choosing a level

Start at the lowest level that fits, and move up only when the current one hurts. Signs that it hurts:
you cannot find code, or one change touches many unrelated folders.

| Signal | Level |
|---|---|
| ≤ ~10 screens, 1–2 devs, few domains | 1. Small app |
| Several domains, shared folders growing, "where does this go?" debates | 2. Feature-based |
| Features keep needing each other's models, several teams, enforced ownership | 3. FSD |

## Level 1: small app

```
src/
├── app/ or pages/        # routes (thin)
├── components/
│   └── UserCard/
│       ├── UserCard.tsx
│       ├── UserCard.test.tsx
│       └── UserCard.helpers.ts
├── hooks/
├── lib/                  # configured libraries: api client, query client
├── utils/                # generic, domain-free functions
└── constants.ts          # app-wide constants only
```

Rules:
- One folder per non-trivial component. Its private helpers, constants, types, styles and test live inside.
- Nest component folders at most two levels deep. Deeper nesting means the child should be its own feature
  or shared component.

## Level 2: feature-based (default)

```
src/
├── app/                  # routes, layouts, providers; composes features
├── features/
│   ├── reviews/
│   │   ├── api/          # requests + schemas + query hooks
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── model/        # business rules, mappers (pure TS)
│   │   ├── constants.ts
│   │   └── types.ts
│   └── repositories/
├── components/           # shared UI used by 2+ features (+ ui/ kit)
├── hooks/                # shared hooks
├── lib/                  # configured third-party wrappers, API client
├── config/               # env + app-wide config
├── types/                # truly shared types
├── utils/                # generic functions
└── testing/              # test utilities, mocks
```

Rules:
- Most code lives in `features/`. Shared folders hold only code with two or more consumers.
- A feature includes only the segments it needs.
- Features never import each other. If two features need the same thing, either move it down to shared
  code, or compose both features in a route and pass data through props or children.
- Routes stay thin: read params, pick features, lay them out.

## Level 3: Feature-Sliced Design

Layers from top to bottom. A module imports only from layers **strictly below** it.

| Layer | Holds | Sliced? |
|---|---|---|
| `app` | providers, routing, global styles | no |
| `pages` | full pages / route screens | yes |
| `widgets` | large self-contained UI blocks composed of features + entities | yes |
| `features` | user interactions that bring business value (`add-comment`, `run-review`) | yes |
| `entities` | business entities and their model/UI (`user`, `pull-request`) | yes |
| `shared` | UI kit, api client, libs, config: no business logic | no |

Segments inside a slice: `ui`, `api`, `model`, `lib`, `config`. Name them by purpose, not by
file type (`hooks/` and `types/` are discouraged as segment names).

Rules:
- Slices on the same layer do not import each other. The one exception is `entities`, which may cross-import
  through the explicit `@x` API (`entities/a/@x/b.ts`), and those should be kept to a minimum.
- Each slice exposes a public API (`index.ts`) with explicit named exports. In `shared`, give each
  component or lib its own index instead of one big barrel.
- Mapping from Level 2: the feature's `model/` + entity-level types become `entities/<x>`. Large blocks
  composed on many pages become `widgets/<x>`. Route screens become `pages/<x>`.
- Adopt FSD only when the current architecture causes pain. Migrate incrementally, one slice at a time.

## Next.js App Router variants

Next.js is unopinionated. Three valid strategies, so pick one and be consistent:

1. **Project files outside `app/`.** `app/` is routing only, and all code lives in `src/features`,
   `src/components`, and so on. This is best when routes and features don't map 1:1.
2. **Split by route (colocation).** Route-specific code lives inside the segment in private folders
   (`app/blog/_components/`, `app/blog/_lib/`). Globally shared code lives in `src/components`,
   `src/lib`, and so on. This is best when each feature is one route subtree.
3. Top-level folders inside `app/`: same as 1 but nested under `app/`. This is rarely better than 1.

Notes:
- `_folder` opts a folder out of routing. Use it for colocated UI and helpers.
- `(group)` organizes routes without changing the URL. Use it for sections and separate layouts.
- `page.tsx` / `layout.tsx` stay thin. They compose `_components` and fetch at the boundary.

## Naming conventions

The specific convention matters less than having one. Common, compatible choices:
- Components and their folders: `PascalCase` (`PrRow/PrRow.tsx`). Other modules: `kebab-case` or
  `camelCase`, but only one of them, applied repo-wide.
- Component companions: `<Name>.helpers.ts`, `<Name>.constants.ts`, `<Name>.types.ts`, `<Name>.test.tsx`
  (or plain `helpers.ts` / `constants.ts` inside the component folder).
- Hooks: `use<Thing>` and file `use-thing.ts` / `useThing.ts`. Only functions that call hooks get the `use` prefix.
- Plural for top-level buckets (`components/`, `hooks/`, `utils/`). Singular for a feature or entity name.

## Anti-patterns

- Type-based structure at scale (`components/` with 200 files, `hooks/` with 80 files, unrelated domains mixed).
- A `common/` or `shared/` folder that accumulates single-use code "for later reuse".
- `utils.ts` with domain logic in it. That code is a helper and belongs to its feature.
- Mirroring `src/` in a separate `__tests__/` tree. Put tests next to the code instead.
- Premature FSD on a small app (empty layers, cross-layer gymnastics for trivial screens).
