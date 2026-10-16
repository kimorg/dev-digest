# Boundaries and imports

## Contents
- Dependency direction
- Breaking a feature-to-feature dependency
- Barrel files and public APIs
- Path aliases
- Enforcing with ESLint
- Circular imports

## Dependency direction

```
shared (components, hooks, lib, utils, config, types)
   ↑ imported by
features/*            (never import each other)
   ↑ imported by
app / routes / pages  (compose features)
```

- Shared code must not import from features or app.
- Features import only shared code (and their own files).
- App/routes import features and shared code.
- In FSD the same rule generalizes: a layer imports only from layers strictly below it, and slices on one
  layer are isolated.

## Breaking a feature-to-feature dependency

When feature A wants something from feature B:
1. **Is it generic?** Move it to shared code (component, hook, util).
2. **Is it a shared business entity** (both need the `PullRequest` model)? Move the model to a lower
   layer (shared `types/` + helpers, or `entities/` in FSD).
3. **Is it UI from B shown inside A?** Compose at the route: the page renders both, passing B's element
   to A via `children` or a slot prop.
4. **Is it a reaction to B's event?** Lift the state or callback to the route, or share it through the server
   cache (invalidate B's query from A's mutation using B's exported key factory/hook).

## Barrel files and public APIs

A *barrel* is an `index.ts` that re-exports a folder's modules.

Avoid barrels inside application code:
- importing one item loads every re-exported module, which slows dev servers and tests and can defeat
  tree-shaking
- a module that imports its own folder's barrel creates a cycle
- they don't make anything private, because deep imports still work

Acceptable `index.ts` files:
- the public API of a package or library (one entry point in `package.json`)
- a deliberate public API of a feature or FSD slice: **explicit named exports only, no `export *`**, and
  consumers must use it (enforced by lint)
- a one-line redirect to a component file (`export { PrRow, PrRow as default } from "./PrRow"`) when that
  is the codebase's convention. It re-exports one module, so it carries none of the costs above.

In `shared/ui`, give each component its own entry instead of one index for the whole folder.

## Path aliases

- Configure `@/*` → `src/*` (tsconfig `paths`). Use it for imports across features and from shared code.
- Use relative imports inside one feature or component folder. Moving the folder then keeps them valid,
  and same-slice index cycles are avoided.
- Avoid `../../../` chains that climb out of a feature. They usually signal a boundary violation.

## Enforcing with ESLint

`eslint-plugin-import`, with `import/no-restricted-paths` (flat config):

```js
// eslint.config.mjs
import importPlugin from "eslint-plugin-import";

export default [
  {
    plugins: { import: importPlugin },
    rules: {
      "import/no-restricted-paths": ["error", {
        zones: [
          // features are isolated from each other
          { target: "./src/features/reviews", from: "./src/features", except: ["./reviews"] },
          { target: "./src/features/repos",   from: "./src/features", except: ["./repos"] },
          // one-way flow: features and shared never import app
          { target: "./src/features", from: "./src/app" },
          // shared never imports features or app
          {
            target: ["./src/components", "./src/hooks", "./src/lib", "./src/types", "./src/utils"],
            from: ["./src/features", "./src/app"],
          },
        ],
      }],
      "import/no-cycle": "error",
    },
  },
];
```

`eslint-plugin-boundaries` describes elements by pattern and allows dependencies by type. It scales better
than listing every feature:

```js
// eslint.config.mjs
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app",     pattern: "src/app/*" },
        { type: "feature", pattern: "src/features/*", capture: ["feature"] },
        { type: "shared",  pattern: "src/(components|hooks|lib|utils|config|types)/*" },
      ],
    },
    rules: {
      "boundaries/element-types": ["error", {
        default: "disallow",
        rules: [
          { from: "app",     allow: ["feature", "shared"] },
          { from: "feature", allow: ["shared", ["feature", { feature: "${from.feature}" }]] },
          { from: "shared",  allow: ["shared"] },
        ],
      }],
    },
  },
];
```

Check the installed plugin version's docs for exact option names before copying. For FSD, the `steiger`
linter checks layer and public-API rules.

## Circular imports

- Symptoms: `undefined` at import time, "cannot access X before initialization", or a bundler
  complaining about cycles.
- Usual causes: barrels, two features importing each other, or a shared module importing a feature type.
- Fix: move the shared piece one level down. Do not reorder imports to dodge the cycle.
- Guard with `import/no-cycle` (or the bundler's cycle detection) in CI.
