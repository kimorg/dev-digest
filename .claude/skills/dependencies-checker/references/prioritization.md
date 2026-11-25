# Prioritisation

How a finding gets its priority, when you may change it, and how the plan is ordered.

## Priorities

| P | Meaning | Typical rules | When |
|---|---|---|---|
| **P0** | Broken or exploitable now | `DC-INSTALL`, unresolvable `DC-UNDECLARED` in production code, critical/high `DC-VULN` in the production tree | Before the next merge / release |
| **P1** | Wrong today, will bite soon | `DC-RANGE`, `DC-BROKEN-TREE`, phantom `DC-UNDECLARED`, runtime `DC-UNUSED`, `DC-DEV-IN-PROD` in a package with `start`, `DC-DRIFT` across shared source, moderate `DC-VULN`, strong copyleft in production, runtime `DC-OUTDATED` ≥ 2 majors | This sprint |
| **P2** | Costs size, time or clarity | `DC-HEAVY`, `DC-DUPLICATE` ≥ 5 MB, `DC-PROD-TOOLING`, dev `DC-UNUSED`, other `DC-DRIFT`, `DC-LOOSE-RANGE`, low `DC-VULN`, other `DC-OUTDATED` | Backlog, next time the package is touched |
| **P3** | Know about it | `DC-NATIVE`, small duplicates, `DC-WEAK-USE`, `DC-TYPE-ONLY`, pins, weak copyleft, `@types/*` outdated | Watch; no ticket needed |

## Changing a priority

The default comes from the rule. Change it only for one of these reasons, and write it in the
*Triage* cell (`↓P3 — dev server never exposed`):

**Raise (↑) when**
- the dependency is on a **request path** that takes untrusted input (server routes, the web app,
  repo clones the server processes) and the finding is a vulnerability or a correctness risk;
- it blocks another plan item (e.g. a drift that must be fixed before a security upgrade);
- the same root cause appears in **3+ packages** (one fix, wide effect).

**Lower (↓) when**
- every path to it is **local developer tooling** never exposed to a network or untrusted input
  (vitest UI, vite dev server, drizzle-kit) and the advisory needs such exposure;
- it is the **framework's intrinsic cost** (`next` SWC binary, an SDK's bundled CLI) — no
  realistic alternative within the stack;
- the package has **no production install** (`evals/`, `e2e/`): misplacement rules are cosmetic;
- the dependency is a **documented, deliberate** choice (see package `AGENTS.md` / `INSIGHTS.md`).

Never lower a P0 vulnerability below P1 without naming why the vulnerable code is unreachable.

## Effort

| Size | Meaning | Examples |
|---|---|---|
| **S** | < 1 h, mechanical, existing tests cover it | remove an unused dep, move dev ↔ prod, patch/minor upgrade, `dedupe` |
| **M** | ≤ 1 day, needs reading a changelog and running all tests of affected packages | one major upgrade of a library, aligning a drift in 2–3 packages, lazy-loading a heavy UI library |
| **L** | > 1 day or cross-cutting | framework major (Next, Fastify, Vitest across 5 packages), replacing a library, `zod` 3 → 4 in vendored contracts |

## Gain

State gain with numbers from the collector, never by hand:

- **Size:** `exclusiveBytes` of the dependency (removal) or `extraBytes` (dedupe). Say *install
  size*; promise *bundle size* only after measuring `next build`.
- **Risk:** advisories closed (count, worst severity), packages no longer on a phantom import,
  license or supply-chain items removed.
- **Consistency:** packages brought to one version line.

## Ordering the plan

1. By priority bucket (P0 → P3).
2. Inside a bucket: **cheap wins first** — highest gain per effort (S before M before L at similar
   gain); actions that unblock others before the ones they unblock.
3. One row per **action**. An action can close many findings (one `vitest` upgrade closes
   `DC-VULN` + `DC-OUTDATED` + `DC-DRIFT` in four packages). Cite all of their IDs.
