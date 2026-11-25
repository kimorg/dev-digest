# Finding rules

One section per rule id. Default priorities and thresholds live in `scripts/lib/rules.mjs`
(`THRESHOLDS`, `buildFindings`) — keep this file in sync when you change them.

Each rule lists **what it detects**, its **default priority**, **known false positives** with the
**check** that tells them apart, and the usual **fix**. Use the check before you confirm.

## Contents

- Install state: [DC-INSTALL](#dc-install) · [DC-RANGE](#dc-range) · [DC-BROKEN-TREE](#dc-broken-tree)
- Usage: [DC-UNDECLARED](#dc-undeclared) · [DC-UNUSED](#dc-unused) · [DC-WEAK-USE](#dc-weak-use) · [DC-DEV-IN-PROD](#dc-dev-in-prod) · [DC-PROD-TOOLING](#dc-prod-tooling) · [DC-TYPE-ONLY](#dc-type-only)
- Shape and size: [DC-DRIFT](#dc-drift) · [DC-DUPLICATE](#dc-duplicate) · [DC-HEAVY](#dc-heavy) · [DC-LOOSE-RANGE](#dc-loose-range)
- Supply chain: [DC-LICENSE](#dc-license) · [DC-NATIVE](#dc-native)
- Online only: [DC-VULN](#dc-vuln) · [DC-OUTDATED](#dc-outdated) · [DC-DEPRECATED](#dc-deprecated)

---

## DC-INSTALL

**Detects:** the package has no `node_modules`, or a declared (non-optional) dependency does not
resolve from it. **Default:** P0.
**False positives:** the user never installs that package locally (e.g. `evals/` on a machine
that does not run evals). **Check:** ask, or look at `scripts/dev.sh` / CI to see whether the
package is expected to be installed. **Fix:** `cd <pkg> && <pm> install`. For a whole missing
package, re-run the check after installing — sizes and usage of bins were not measured.

## DC-RANGE

**Detects:** the installed version does not satisfy the range in `package.json` (lockfile or
`node_modules` out of date after someone edited the manifest). **Default:** P1.
**False positives:** none known; a stale `node_modules` after `git pull` is the usual cause.
**Fix:** `<pm> install`; if the lockfile is the stale part, commit the refreshed lockfile.

## DC-BROKEN-TREE

**Detects:** an installed package depends on something that is not installed (non-optional).
**Default:** P1.
**False positives:** the dependency is provided by the platform or listed as optional in a newer
manifest. **Check:** `<pm> why <name>` / `npm explain <name>`. **Fix:** clean reinstall.

## DC-UNDECLARED

**Detects:** a file imports a package the package's `package.json` does not declare (phantom
dependency). It works today only through hoisting (pnpm's `.pnpm/node_modules`, npm's flat tree)
or not at all. **Default:** P0 when it does not resolve and is used by production code, P1 when it
resolves only by hoisting and is used by production code, P2/P1 for tests.
**False positives:**
- the "import" is inside a string the regex could not tell apart (code samples in tests outside
  template literals, generated code) — **check:** open the example file at the cited line;
- the specifier is a path alias the collector did not see (alias defined somewhere other than the
  package's `tsconfig.json`, e.g. a bundler or vitest alias) — **check:** `grep -n alias <pkg>/vitest.config.* <pkg>/next.config.*`.
**Fix:** add it with the package's manager (`-D` when only tests use it). Never rely on hoisting.

## DC-UNUSED

**Detects:** a declared dependency with no evidence of use: no import/require/dynamic import, no
bin used by an npm script, no package-name string in a config file, not a peer of another direct
dependency, not the target of a used `@types/*`. **Default:** P1 runtime, P2 dev, P3 when another
direct dependency pulls it in anyway (removing it frees nothing — it only pins the version).
**False positives (check every one before confirming):**
- used by a **shell script, CI workflow or Dockerfile** (`npx drizzle-kit`, `node_modules/.bin/x`)
  — **check:** `git grep -n "<name>\|<bin>" -- scripts .github '*.sh' Dockerfile*`;
- loaded **by name at runtime** through a variable or a config object the collector did not scan
  (plugin lists in JSON/YAML, `require(variable)`) — **check:** `git grep -n "<name>" -- <pkg> ':!**/package.json' ':!**/*lock*'`;
- an **implicit peer** of a tool that does not declare it (e.g. `postcss` for Next/Tailwind setups,
  `react-dom` for some frameworks) — **check:** the tool's docs / its `peerDependenciesMeta`;
- a **deliberate pin** to force a version of a transitive dependency — **check:** commit message
  that added it (`git log -S '"<name>"' -- <pkg>/package.json`), `INSIGHTS.md`.
**Fix:** `cd <pkg> && <pm> remove <name>`, then the package's typecheck and tests.

## DC-WEAK-USE

**Detects:** the only evidence is a string literal equal to the package name in non-config code
(e.g. a logger transport `'pino-pretty'`, a dynamic `import(name)`). **Default:** P3.
**Check:** open the file: does the string load the package (transport, plugin, test environment,
optional dynamic import)? If yes → `❌ false positive — loaded by name in <file>`; if it is just a
label → treat as `DC-UNUSED`. **Fix:** none, or remove.

## DC-DEV-IN-PROD

**Detects:** a `devDependency` imported (as a value, not `import type`) by production code
(`src/`, not tests/config/scripts). **Default:** P1 when the package has a `start` script
(a production install without dev deps would crash), P3 otherwise (no production install exists,
e.g. `evals/`).
**False positives:**
- the file is test support living under `src/` (fixtures, test utils) — **check:** who imports
  that file;
- the code is compiled away at build time (macros, build-only helpers) — **check:** the build config.
**Fix:** `<pm> add <name>` (moves it to `dependencies`).

## DC-PROD-TOOLING

**Detects:** a runtime `dependency` used only by tests, config files, stylesheets, scripts or npm
scripts other than `start` — it ships with every production install for nothing. **Default:** P2.
**False positives:**
- the bin is called at runtime by code (`spawn('drizzle-kit', …)`) — **check:** `git grep -n "<bin>" -- <pkg>/src`;
- the package is a deliberate runtime capability (e.g. a CLI the server executes) — **check:**
  package `AGENTS.md` / module README.
**Fix:** `<pm> add -D <name>`.

## DC-TYPE-ONLY

**Detects:** a runtime library imported only with `import type`. **Default:** P3.
**False positives:** its types are part of the package's public API (exported types that
consumers compile against) — then it must stay in `dependencies`. **Fix:** move to dev if not.

## DC-DRIFT

**Detects:** one dependency on different compatibility lines across packages (different major, or
different minor for `0.x`). **Default:** P1 for a library when the packages **share source**
through tsconfig aliases (e.g. `server` compiles `reviewer-core/src` and the vendored
`@devdigest/shared`) — types and runtime behaviour of the shared code then depend on which
package compiles it; P2 for other libraries; P3 for tooling, test and types.
**False positives:** a deliberate, documented split (e.g. a package migrated first as a pilot) —
**check:** the package `INSIGHTS.md` / `AGENTS.md`. Still worth a dated plan item.
**Fix:** align the range in every package in one change, then run every affected package's tests.
Remember that `@devdigest/shared` is vendored twice (server and client): contract code compiled
against two different `zod` majors drifts silently.

## DC-DUPLICATE

**Detects:** a package installed in two or more versions inside one package's tree. One finding
per duplicate with ≥ 5 MB of extra copies (P2), one summary finding for the small ones (P3).
**False positives:** copies forced by incompatible ranges of two direct dependencies — not a
false positive, but the fix is upgrading the parent, not dedupe. **Check:** `pnpm why <name>` /
`npm explain <name>`. **Fix:** `<pm> dedupe`; upgrade the parent holding the old range; an
`overrides` entry as a last resort (document it).

## DC-HEAVY

**Detects:** a direct dependency whose **exclusive** footprint (packages only it pulls in) is
≥ 20 MB for a runtime library, ≥ 50 MB for dev/tooling. **Default:** P2 runtime, P3 dev.
**False positives:** the framework itself (`next`, its SWC binary and `sharp`) or an SDK that ships
a platform binary on purpose — these are the cost of the stack, not a defect.
**Check:** what is big (`du -sh <pkg>/node_modules/.pnpm/<name>*` or the closure list in the JSON)
and how much of it is used (one icon from `lucide-react`, one diagram type from `mermaid`?).
Install size is not bundle size: for `client/` code imported by `'use client'` files, confirm with
`next build` output before promising a bundle win.
**Fix:** sub-path / per-icon imports, lazy `import()` behind the feature that needs it, a lighter
alternative, or accept with a reason (`↓P3 — framework`).

## DC-LOOSE-RANGE

**Detects:** `*`, `latest`, `x` or an open `>=` range (P2) — any install may pull a new major; or a
non-registry spec (`git`, `file:`, `link:`, `github:`) (P3). **Fix:** caret range on the version in
use; for non-registry specs, document why.

## DC-LICENSE

**Detects:** non-permissive or unknown licenses in the tree. **Default:** P1 strong copyleft (GPL,
AGPL, SSPL…) in the production tree, P2 unknown in production, P3 weak copyleft (LGPL, MPL) in
production or strong copyleft in dev-only trees.
**False positives:** `UNKNOWN` / `SEE LICENSE IN …` where the LICENSE file is permissive, or a
proprietary-but-allowed vendor SDK — **check:** read `<pkg>/node_modules/<name>/LICENSE*`.
LGPL native libraries loaded dynamically (e.g. `libvips` behind `sharp`) are normally fine —
say so. **Fix:** record the decision; replace the package if the license does not fit.

## DC-NATIVE

**Detects:** installed packages with native binaries (`.node` files, `binding.gyp`) or install
hooks (`preinstall`, `install`, `postinstall`). **Default:** P3, one finding per package.
**Why it matters:** install scripts are a supply-chain entry point; native binaries are
platform-specific (CI, Docker and Apple-silicon laptops need matching builds). With pnpm ≥ 10,
build scripts run only for packages approved in `pnpm-workspace.yaml` (`allowBuilds` /
`onlyBuiltDependencies`). **Fix:** keep that list explicit and minimal; note new entries.

## DC-VULN

*Online only.* **Detects:** npm advisories from `<pm> audit`, grouped per vulnerable package.
**Default:** critical/high → P0, moderate → P1, low → P2, info → P3; one step lower when every path
to it is dev-only.
**Re-prioritise with judgement:** reachability matters. A DoS in a dev server (`vite`, `vitest`
UI) that never listens on a public interface is lower than an SSRF in the production web app.
`↓` needs a reason tied to how the code runs (local-only tool, feature not used, input never
attacker-controlled). **Fix:** upgrade the direct dependency that pulls it in (see *Hotspots*:
several packages often share it); `overrides` for transitive pins when the parent has no release.

## DC-OUTDATED

*Online only.* **Detects:** the latest release is one or more breaking releases ahead (major, or
minor for `0.x`). **Default:** runtime library P1 (≥ 2 behind) / P2; dev, tooling, test P2 (≥ 2) /
P3; `@types/*` P3 — `@types/node` must follow the Node major you run, not npm latest.
**Fix:** one upgrade per dependency across all packages at once (see *Cross-package versions*),
changelog first, tests after.

## DC-DEPRECATED

**Detects:** the installed version is deprecated by its maintainers (offline: the installed
manifest's `deprecated` field, rarely present; online: registry flag from `pnpm outdated`).
**Default:** P1 runtime, P2 dev. **Fix:** follow the deprecation notice.
