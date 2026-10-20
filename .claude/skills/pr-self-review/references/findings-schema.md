# Findings format and severity rules

One file per skill bucket: `$TMP/findings/<skill>.json`. `verdict.mjs` validates it and rejects the
whole run (exit 2) on any error.

```json
{
  "skill": "onion-architecture",
  "findings": [
    {
      "file": "server/src/modules/agents/service.ts",
      "line": 42,
      "severity": "CRITICAL",
      "title": "Service imports drizzle-orm directly",
      "rule": "Dependency rule: services may not import the ORM",
      "evidence": "server/src/modules/agents/service.ts:42 — import { eq } from 'drizzle-orm'",
      "fix": "Move the query into modules/agents/repository.ts and call it through the module's port"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `skill` | yes | Must equal the bucket name |
| `findings` | yes | `[]` when clean |
| `file` | yes | Must be one of this bucket's files (`plan.buckets[skill]`) |
| `line` | for CRITICAL | Line in the **new** version of the file (positive integer) |
| `severity` | yes | `CRITICAL` · `WARNING` · `SUGGESTION`, or the skill's own scale (`HIGH`, `MEDIUM`, `LOW`, `INFO`), mapped below |
| `title` | yes | One line. Duplicates (same file, line, title) across skills are merged |
| `rule` | no | Which rule of the skill this breaks |
| `evidence` | for CRITICAL | Must contain `path:line`. Quote the offending code |
| `fix` | no | Concrete change, not "consider improving" |

## Severity: one scale for every skill

Same scale as the product (`Severity` in `server/src/vendor/shared/contracts/findings.ts`).

| Severity | Meaning | Blocks? |
|---|---|---|
| **CRITICAL** | Will cause a bug, data loss or a security hole, or breaks a dependency-direction rule | **yes** |
| **WARNING** | Real problem: maintainability, a pattern violation, a likely perf issue | no |
| **SUGGESTION** | Improvement, style, naming | no |

`verdict.mjs` maps each skill's own scale the same way every time (`severityMap` in `routing.json`):

| Skill's label | Default | `security` |
|---|---|---|
| CRITICAL | CRITICAL | CRITICAL |
| HIGH | WARNING | **CRITICAL** |
| MEDIUM | SUGGESTION | WARNING |
| LOW / INFO | SUGGESTION | WARNING |

**Advisory skills** (`react-testing-library`, `zod`, `typescript-expert`) are capped at WARNING:
they cannot block.

## Deterministic checks (added by `verdict.mjs`, not by reviewers)

| Check | When | CRITICAL when |
|---|---|---|
| `typecheck` | a `.ts/.tsx`, `tsconfig*.json` or `package.json` changed in a package (server and reviewer-core go together) | any `tsc --noEmit` error. All packages typecheck clean at HEAD, so every error is new |
| `dependency-cruiser` | a `server/src` or `reviewer-core/src` TS file changed | a violation of the onion-architecture rules in a changed file that the `HEAD` baseline lacks, matched by (file, rule, import specifier) |

Either one that cannot run becomes a WARNING "… not run: <reason>".

## When something is CRITICAL, per skill

- **frontend-architecture**: a feature importing another feature, shared code (`src/components`,
  `src/lib`) importing from a route or feature, or a second HTTP client next to `src/lib/api.ts`.
  Everything else on its review checklist is a WARNING.
- **onion-architecture**: a dependency-rule break. Examples: a domain or service file importing the framework,
  `drizzle-orm`, an SDK, `process.env`, the container or a repository; a module importing another
  module's internals. Do not re-report import violations: dependency-cruiser checks them
  automatically. Report what it cannot see, such as a business rule in the wrong ring.
  **WARNING, not CRITICAL:** a new `this.container.x` read on a known legacy edge, SQL that belongs
  in the repository but adds no new import, and every other checklist item.
- **react-best-practices**: rules the skill tags CRITICAL (impure render, broken hook rules,
  state that causes wrong UI). HIGH → WARNING, MEDIUM → SUGGESTION.
- **next-best-practices**: server-only code or secrets reaching a client component, a broken
  RSC boundary (`'use client'` importing server-only modules), a sync API misuse that crashes.
- **security**: the skill's own classification, with its confidence rule. Low confidence is
  never CRITICAL. HIGH counts as CRITICAL.
- **fastify-best-practices / drizzle-orm-patterns / postgresql-table-design**: only when it will
  break at runtime or lose data. Examples: a missing `await` on a write, an unvalidated body reaching the DB, a
  migration that drops or rewrites data without a backfill, a missing `NOT NULL` default on an
  existing table.
- Anything else is a WARNING or a SUGGESTION. **When in doubt, it is not CRITICAL.**
