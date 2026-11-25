# Report template

The report is one Markdown file. Sections 2–6 and 9 are **generated** by `collect.mjs`
(`lib/render.mjs`); you fill the `<!-- AGENT:… -->` slots in sections 1, 6 (*Triage* column), 7
and 8. Section numbers and headings are fixed so reports from different dates diff cleanly.

| § | Section | Source | Content |
|---|---|---|---|
| — | Header | generated | Repo, date, commit, branch, dirty files, mode, package count, how to read the size columns |
| 1 | Summary | **agent** | 3–5 bullets |
| 2 | Component map | generated | Mermaid flowchart: packages, vendored source, infrastructure, alias / HTTP / TCP / copy edges |
| 3 | Packages at a glance | generated | One row per package + a pie of install footprint per package |
| 4 | Package details | generated | Per package: totals, dependency diagram, footprint pie, full dependency table, undeclared imports, licenses, duplicates, native code |
| 5 | Cross-package versions | generated | Version matrix of dependencies declared in 2+ packages, ⚠ on drift |
| 6 | Findings | generated + **agent** | *Hotspots* table; all findings sorted by priority; you fill *Triage* |
| 7 | Prioritised plan | **agent** | Actions in P0–P3 buckets |
| 8 | Recommendations | **agent** | 3–7 structural recommendations |
| 9 | Method and limits | generated | What was measured, how, what was not, thresholds, the reproduce command |

## Reading the generated columns

| Column | Meaning |
|---|---|
| Section · category | `prod` / `dev` / `optional` / `peer` from `package.json` · `library` / `tooling` / `test` / `types` by name |
| Declared → installed | Range in `package.json` → version resolved from `node_modules` |
| Used by (files) | Files per context: `src`, `test`, `config`, `style`, `script`; `(types)` = only `import type`; `bin x→dev/test` = bin used by those npm scripts; `peer of …`; `types for …` |
| Own | The package's own directory |
| Closure | It plus everything it pulls in (count of packages in brackets) |
| Exclusive | Packages in the closure no other direct dependency needs = what removal frees |
| Flags | Rule ids of its findings, `browser` (imported by a `'use client'` file), `native` (native code or install scripts in its closure) |

Diagram colours (per-package diagrams): red dashed = unused, amber = heavy, violet = drift,
yellow = any other finding. Only the top N dependencies by closure size are drawn (`--top`, default 12).

## Slot shapes

### `AGENT:SUMMARY`

3–5 bullets. Each has a number and points to findings or a section.

```markdown
- **Health:** 6 packages, 1.4 GB installed in 1 082 packages; no broken installs, no phantom imports in production code.
- **Security (online):** 23 P0 advisories, 3 of them reachable from the web app (`next` 15.5.19 — RCE / SSRF, F03). One upgrade to 15.5.24 closes 14 advisories.
- **Biggest size win:** `mermaid` is 113 MB exclusive in `client` for one diagram component (F04) — lazy-load it.
- **Consistency:** `zod` 3 vs 4 (`mcp`) and `vitest` 2 vs 5 (`mcp`) — F13, F22.
```

### Triage cell

`✅ confirmed`, `✅ confirmed — <extra fact>`, `❌ false positive — <evidence>`,
`↓P3 — <reason>`, `↑P1 — <reason>`, `✅ confirmed — see F03` for shared verdicts.
P3 rows outside the always-triage rules may stay empty.

### `AGENT:PLAN`

One table per bucket that has actions. One row per action; an action may close many findings.

```markdown
### P0 — now
| # | Action | Closes | Packages | Effort | Gain | First step |
|---|---|---|---|---|---|---|
| 1 | Upgrade `next` to ≥ 15.5.24 | F03, F84 | client | S | 14 advisories (2 critical) closed | `cd client && pnpm add next@^15.5.24` → `pnpm typecheck && pnpm test` |

### P1 — this sprint
| … |

### P2 — backlog
| … |

### P3 — watch
- `DC-NATIVE` in all packages — keep `allowBuilds` explicit (F24–F29).
```

Effort and gain follow [prioritization.md](prioritization.md). False positives do not appear.

### `AGENT:ADVICE`

3–7 numbered recommendations about **how the repo manages dependencies**, not single fixes
(those are in the plan). Each: a bold one-line recommendation, *Why* (findings / numbers),
*How* (first step).

```markdown
1. **One version line per shared library.** *Why:* `zod` and `vitest` drift across packages (F13, F22) while `server` compiles vendored contracts. *How:* list the shared libraries in root `AGENTS.md`; upgrade them in one PR across packages.
2. **Fail CI on new unused / undeclared dependencies.** *Why:* … *How:* run `collect.mjs --packages <changed>` in the per-package workflow and fail on new `DC-UNDECLARED` / `DC-UNUSED`.
```

Good topics: version alignment policy, CI gate (offline collector is ~1 s), scheduled online
audit, upgrade waves (group majors), lazy loading of heavy UI libraries, `overrides` hygiene,
`allowBuilds` review, who owns which package's dependencies.
