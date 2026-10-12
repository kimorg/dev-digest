# client (`@devdigest/web`) — agent map

Next.js studio: add repos, browse PRs, run and read reviews, edit agents.
Overview and UI route map: [README](README.md).

## Stack

Node ≥ 22 · TypeScript · Next.js 15 (App Router) · React 19 · TanStack Query ·
Tailwind CSS 4 · next-intl · recharts · mermaid · react-markdown · Zod 3 ·
Vitest + React Testing Library + jsdom · pnpm.

## Commands

```sh
pnpm install
pnpm dev         # :3000 — needs the API on :3001 (../scripts/dev.sh)
pnpm test        # vitest + jsdom, fetch mocked — no API needed
pnpm typecheck
```

## Where things live

- `src/app/**/page.tsx` — routes; pages stay thin
- `src/app/**/_components/<Name>/` — feature UI, colocated with its `*.test.tsx`
- `src/lib/hooks/*` — TanStack Query hooks; `src/lib/api.ts` — the only HTTP client
- `src/components/app-shell/` — nav, breadcrumbs, `g`-then-key shortcuts
- `src/vendor/ui/` (`@devdigest/ui`) — UI primitives; `src/vendor/shared/` — Zod contracts
- `messages/en/*.json` — UI strings (next-intl)

## Conventions

- Data access only through hooks in `src/lib/hooks` → `src/lib/api.ts`; no ad-hoc `fetch` in components.
- User-visible text goes into `messages/en/*.json`, not inline strings.
- New component = `_components/<Name>/` folder with its own test; nested components nest the same way.
- Reuse primitives from `@devdigest/ui` before writing new ones.
- API base URL comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`).

## Naming

- **Feature component:** `_components/<Name>/` → `<Name>.tsx`, `index.ts`
  (`export { X, X as default } from "./X"`), optional `constants.ts` · `helpers.ts` · `styles.ts` ·
  `<Name>.test.tsx`. Shared ones: `src/components/<kebab-folder>/<Name>.tsx` (`run-cost-badge/RunCostBadge.tsx`).
- **Components:** named function export matching the file; props `interface <Name>Props`; callback
  props `on<Event>` (`onOpenTrace`); booleans `is|has|can*`.
- **`styles.ts`:** one exported object `s`, camelCase keys, dynamic styles as functions (`s.card(focused, …)`).
- **Hooks:** `use<Entity>` (detail), `use<Entities>` (list), `use<Verb><Entity>` (mutation:
  `useCreateAgent`, `useDeleteRun`), `usePr<X>` for PR-scoped data. Files `src/lib/hooks/<domain>.ts`;
  component-local hooks in `hooks/use<X>.ts`.
- **Query keys:** `["<kebab-resource>", id?]` — singular for detail, plural for list (`["agent", id]` /
  `["agents"]`, `["pr-runs", prId]`); invalidate with the same keys.
- **i18n:** `messages/en/<camelNamespace>.json` (`prReview`), nested camelCase keys
  (`finding.suggestedFix`), `const t = useTranslations("<ns>")`.
- **Misc:** `src/lib/*` kebab-case (`.tsx` only with JSX); constants SCREAMING_SNAKE; `data-testid`
  kebab-case `<component>[-<state>]` (`findings-severity-none`); test suites
  `describe("<Name> (smoke)")` / `describe("<Name> — <aspect>")`.

## Gotchas

- `src/vendor/shared` is a copy of `server/src/vendor/shared` and has drifted — when a
  contract changes, update both and keep types in sync.
- Component tests mock `fetch`; real browser journeys live in [../e2e](../e2e/AGENTS.md).
  If you change text or URLs a flow waits on, update the matching `e2e/specs/*.flow.json`.

## Do not touch

- `pnpm-lock.yaml` — never hand-edit; it changes only via `pnpm install|add|remove` and is committed
  with `package.json` (CI runs `pnpm install --frozen-lockfile`). Don't add a `package-lock.json`.

## Read before you work

- Feature spec for the task → [specs/](specs/README.md)
- Deeper reference → [docs/](docs/README.md) · test strategy → [../TESTING.md](../TESTING.md)
- Past learnings → [INSIGHTS.md](INSIGHTS.md) — read before non-trivial work; new entries are
  added by the `engineering-insights` skill (append-only, no duplicates).
