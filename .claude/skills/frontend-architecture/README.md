# Frontend Architecture Skill

**Version:** 1.0.1 · **Scope:** React / Next.js frontend architecture (not performance)

## Motivation

The existing frontend skills cover *how to write* React (`react-best-practices`: hooks misuse,
anti-patterns, performance) and Next.js specifics (`next-best-practices`: RSC, file conventions,
data patterns). Neither answers the structural questions that come up on every task:

- Where does a new component go, and when does it become shared?
- How should a component be split?
- Where do constants, types, hooks and API calls live?
- What is a helper and what is a util?
- Where does business logic live, if not in components or effects?
- Which way may imports point between shared code, features and routes?

This skill gives one default answer to each, built from the sources below, and stays out of performance.

## Positions taken (and why)

| Question | Position | Why |
|---|---|---|
| Group by type or by feature? | Colocate first, then feature folders once the app grows. FSD only for large apps or many teams | Colocation and Bulletproof React/Wieruch favor feature grouping for maintainability. Comeau groups by function because feature boundaries drift. The skill keeps his component-folder colocation and treats features as the next step up |
| When to make code shared? | On the 2nd real consumer, and demote it when one remains | Kent C. Dodds (colocation, AHA), Sandi Metz (wrong abstraction), Wieruch (promote/demote) |
| Barrel files? | Avoid folder barrels in app code. Allow explicit public APIs and one-file redirects | TkDodo and Bulletproof React document the cost (cycles, slow dev). Comeau is tolerant. FSD keeps `index.ts` as a public API but warns about barrels in `shared` |
| Container/presentational? | Replaced by custom hooks | Dan Abramov's 2019 note and patterns.dev |
| Where does business logic live? | Plain TS model functions. Hooks orchestrate, components render | Martin Fowler (layered React), react.dev (effects, custom hooks) |
| Helper vs util | Helper is project/domain-specific. Util is generic | Josh Comeau's definition |

## File structure

```
frontend-architecture/
├── SKILL.md                         # core rules, placement tables, checklists (loaded on trigger)
├── README.md                        # this file (for humans; not loaded by the agent)
├── references/                      # loaded on demand, one level deep from SKILL.md
│   ├── project-structure.md         # small → feature-based → FSD layouts, Next.js variants, naming
│   ├── component-design.md          # view / view-model / model, splitting, composition, props
│   ├── logic-placement.md           # domain logic, hooks, helpers vs utils, constants, types, API, state
│   ├── boundaries-and-imports.md    # dependency direction, barrels, aliases, ESLint configs, cycles
│   └── examples.md                  # bad → good refactors
└── evals/
    ├── evals.json                   # 3 evaluation scenarios
    └── fixtures/ReviewRunsPanel.tsx # "god component" input for scenario 2
```

## How it was built (skill-authoring practices applied)

- **Frontmatter per the Agent Skills spec:** `name` matches the folder (lowercase, hyphens, ≤ 64 chars).
  `description` is third-person, ≤ 1024 chars, with no XML. It states *what* and *when* and includes
  trigger terms. The version goes in `metadata.version`, because the spec's `metadata` is a string→string map.
- **Concise SKILL.md** (well under the 500-line limit). It holds only decisions Claude would not make by
  default, not React basics.
- **Progressive disclosure:** details are in `references/`, linked directly from SKILL.md (one level
  deep). Every reference file over 100 lines starts with a table of contents.
- **One default with an escape hatch** (feature-based, with FSD when it's needed), not a menu of
  equal options.
- **Consistent terminology** (shared / feature / app, helper / util), defined once at the top.
- **No time-sensitive statements.**
- **Workflow + feedback loop:** a copyable placement checklist and a structure-review checklist.
- **Evaluations:** three scenarios in `evals/evals.json`, in the format from Anthropic's guide.
- **Repo-specific section kept short:** it maps concepts to DevDigest `client/` paths and defers to
  `client/AGENTS.md` for naming instead of duplicating it.

## Versioning

Semantic versioning in `metadata.version` (SKILL.md frontmatter):
- **major:** a changed default (e.g. switching the default architecture)
- **minor:** new rules, sections or references
- **patch:** wording, examples, fixes

### Changelog

- **1.0.0** (2026-10-13): initial version.
- **1.0.1** (2026-10-14): fixes from the first eval run. Generic utils also start colocated and are promoted on a consumer outside their folder (the placement table had said "straight to `utils/`"). Added a one-question helper-vs-util test. The DevDigest mapping now says where promoted helpers and utils go (`src/lib/<kebab>.ts`). Evals are grounded in real repo code, with a fixture for the refactor scenario and a composition criterion.

## Sources

### Skill authoring
- [Skill authoring best practices — Anthropic](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): conciseness, degrees of freedom, description rules, progressive disclosure, one-level references, TOC for long files, checklists, evaluations.
- [Agent Skills specification — agentskills.io](https://agentskills.io/specification): frontmatter fields and limits, `metadata.version`, directory layout (`references/`, `scripts/`, `assets/`), < 500-line guidance.
- [Equipping agents for the real world with Agent Skills — Anthropic Engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills): the metadata → SKILL.md → resources loading model.

### Project structure and boundaries
- [Bulletproof React — Project Structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md): `src/` layout, feature folder segments, shared → features → app, no cross-feature imports, `import/no-restricted-paths` zones, avoid barrels.
- [Bulletproof React — Components and Styling](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md): colocation, no nested render functions, limit props, wrap third-party components.
- [Bulletproof React — API Layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md): single API client, request declarations (types + schema + fetcher + hook) per feature.
- [Bulletproof React — State Management](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md): state categories (component, application, server cache, form, URL).
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview): layers, slices, segments, the strictly-downward import rule, when to adopt.
- [Feature-Sliced Design — Public API](https://feature-sliced.design/docs/reference/public-api): explicit public APIs, `@x` cross-imports, per-component indexes in `shared`, circular-import prevention.
- [React Folder Structure Best Practices — Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/): incremental structure growth, promote/demote shared code, deletion test, nesting depth.
- [Delightful React File/Directory Structure — Josh W. Comeau](https://www.joshwcomeau.com/react/file-structure/): component folders, `<Name>.helpers.ts` / `.constants.ts`, the helper vs util definition, app-wide constants.
- [Project structure and organization — Next.js](https://nextjs.org/docs/app/getting-started/project-structure): colocation in `app/`, private `_folders`, route groups, three organization strategies.
- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries): element types and allowed-dependency rules for architecture enforcement.
- [Please Stop Using Barrel Files — TkDodo](https://tkdodo.eu/blog/please-stop-using-barrel-files): barrel costs (cycles, slow dev, lost optimizations), library-entry exception.

### Colocation, abstraction and logic placement
- [Colocation — Kent C. Dodds](https://kentcdodds.com/blog/colocation): "place code as close to where it's relevant as possible", tests/styles/state next to code.
- [AHA Programming — Kent C. Dodds](https://kentcdodds.com/blog/aha-programming): avoid hasty abstractions, optimize for change.
- [The Wrong Abstraction — Sandi Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction): duplication is cheaper than the wrong abstraction, and how to inline it back.
- [Modularizing React Applications with Established UI Patterns — Martin Fowler's site (Juntao Qiu)](https://martinfowler.com/articles/modularizing-react-apps.html): view / hook / domain / gateway layers, anti-corruption layer, strategy pattern.
- [Thinking in React — react.dev](https://react.dev/learn/thinking-in-react): component hierarchy by single responsibility, minimal state, where state lives.
- [Reusing Logic with Custom Hooks — react.dev](https://react.dev/learn/reusing-logic-with-custom-hooks): when to extract hooks, `use` prefix only for hook callers, no lifecycle hooks, concrete use-case hooks.
- [You Might Not Need an Effect — react.dev](https://react.dev/learn/you-might-not-need-an-effect): derive in render, user logic in handlers, app init in root modules.
- [Choosing the State Structure — react.dev](https://react.dev/learn/choosing-the-state-structure): group related state, no contradictions, redundancy, duplication or deep nesting.
- [Passing Data Deeply with Context — react.dev](https://react.dev/learn/passing-data-deeply-with-context): props → composition → context order, and when context fits.

### State and data layer
- [Application State Management with React — Kent C. Dodds](https://kentcdodds.com/blog/application-state-management-with-react): server cache vs UI state, keep state local, composition before context.
- [React Query as a State Manager — TkDodo](https://tkdodo.eu/blog/react-query-as-a-state-manager): the cache as the source of truth, don't sync server data into other state, custom hooks per query.
- [Effective React Query Keys — TkDodo](https://tkdodo.eu/blog/effective-react-query-keys): key structure, per-feature key factories colocated with query hooks.

### Component patterns
- [Container/Presentational Pattern — patterns.dev](https://www.patterns.dev/react/presentational-container-pattern/): the pattern and why hooks replace it.
- [Compound Pattern — patterns.dev](https://www.patterns.dev/react/compound-pattern/): compound components, context vs `cloneElement`.
- [Presentational and Container Components — Dan Abramov](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0): the original article. Its 2019 update withdraws the recommendation in favor of hooks.
