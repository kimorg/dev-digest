# Component design

## Contents
- Responsibilities: view, view-model, model
- When to split a component
- Composition patterns
- Props and API shape
- Component file anatomy
- Anti-patterns

## Responsibilities: view, view-model, model

A layered split for React UIs, following "React is a humble library for building views":

| Layer | Form | Contains | Must not contain |
|---|---|---|---|
| View | component (`.tsx`) | JSX, event wiring, calls to hooks | business rules, fetch calls, data reshaping |
| View-model | custom hook | state, effects, orchestration, calls to model + api | JSX, pure calculations inlined |
| Model / domain | plain TS functions or classes | rules, calculations, validation, mapping | React imports |
| Data / gateway | api module | requests, response parsing, API → domain mapping | UI concerns |

The gateway is an anti-corruption layer. The rest of the app depends on *your* types, not on the raw API
shape, so a backend change touches one file.

Not every component needs all layers. A pure presentational component is view only. Add a hook when state
or effects appear, and add a model function when a rule or calculation appears.

## When to split a component

Split when **any** of these is true:
- A part has its own state or effects that the rest of the component does not use.
- A part changes for a different reason (different product owner, different data).
- A part is (or is about to be) used in a second place.
- You are writing `renderHeader()` / `renderRow()` helpers. Each of those is a component.
- The props list keeps growing with flags that switch whole branches of JSX.

Do **not** split only because of a line count. A long but cohesive form can stay one component. Use
size as a smell that prompts a look, not as a rule.

How to find the boundaries (from "Thinking in React"): draw boxes around the UI, give each box a single
responsibility, and arrange them as a tree. State lives in the closest common parent of everything
that reads it.

## Composition patterns

**children / slots: remove pass-through props.**
```tsx
// before: Layout forwards `user` it never uses
<Layout user={user} />
// after: the caller composes
<Layout header={<UserMenu user={user} />}>
  <Dashboard />
</Layout>
```

**Custom hook instead of container component.** The container/presentational split is obsolete with
hooks. Its author withdrew the recommendation, and hooks do the same separation without an extra
component. Call `useReviewRuns(prId)` inside the component that renders the runs. Keep leaf components
prop-driven so they stay easy to test and reuse.

**Compound components** for parts that share implicit state:
```tsx
<Tabs defaultValue="diff">
  <Tabs.List>
    <Tabs.Trigger value="diff">Diff</Tabs.Trigger>
    <Tabs.Trigger value="findings">Findings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="diff">…</Tabs.Panel>
</Tabs>
```
Share the state through context inside the compound (not `cloneElement`, which breaks when children are wrapped).

**Context last.** Order of preference for passing data down: props → composition with children →
context. Context fits values that many distant components read (theme, current user, router, a
feature-wide reducer). Split context by concern instead of using one app-wide object.

**Wrap third-party components** (date pickers, charts, editors) in your own component with your own props.
Library upgrades and swaps then touch one file.

## Props and API shape

- Props describe **what**, not **how**: `status="failed"` rather than `color="red" icon="x"`.
- Prefer one `variant` union over several mutually exclusive booleans (`isPrimary`, `isDanger`).
- Callback props are `on<Event>` and receive domain values (`onSelect(runId)`), not raw DOM events,
  unless the component is a thin wrapper over a DOM element.
- Pass IDs or the minimal data needed, not whole parent objects "just in case".
- Many props (roughly more than 7) mean the component does too much, or wants composition.

## Component file anatomy

Order inside a component file:
1. imports
2. module constants (`const MAX_VISIBLE = 5`), with no magic numbers in JSX
3. types (`interface PrRowProps`)
4. the component (named export), which calls hooks, derives values, defines handlers, then returns JSX
5. small private sub-components used only here (optional, keep them tiny)

Pure helpers do not go inside the component body. Put them at module level or in `<Name>.helpers.ts`,
so they don't capture props or state by accident and can be unit-tested.

## Anti-patterns

- **God component:** fetches, maps API data, applies business rules, manages five pieces of state, renders
  three screens. Split it into api hook + model functions + view components.
- **Component defined inside a component.** It remounts on every render and loses state. Move it out.
- **Props drilling through 4+ layers that don't use the prop.** Use composition first, then context.
- **Copying props into state** to "edit" them, then syncing with an effect. Derive the value, or reset with `key`.
- **Over-generic shared component** (`<Table>` with 30 props serving every screen). Prefer smaller
  composable pieces, or duplicate per feature until the shared shape is clear.
- **Business conditionals in JSX** (`{user.plan === "pro" && runs.length < 50 && …}`). Name the
  rule (`canRunReview(user, runs)`) and put it in the model.
