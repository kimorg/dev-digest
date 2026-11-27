import { fixtureReader, type AgentCase } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

/**
 * architecture-reviewer — three changes, one per boundary family the agent owns:
 *
 *   fixtures/brief-stale-list.diff — server, a well-built module (`brief`) grows a
 *     "stale briefs" endpoint. Unified diff against HEAD (`git apply --check` passes).
 *   fixtures/review-history.ts — reviewer-core, one new untracked engine file, given whole.
 *   fixtures/findings-summary.diff — server + client, a legacy module (`reviews`) and the
 *     Overview tab grow a findings summary. Unified diff against HEAD.
 *
 * The fixtures are plain code: no comments that name a rule, a ring, a severity or a fix. Every
 * answer the practices check has to come from the agent's procedure and the repo's rules:
 *   1 — NEW CRITICALs in the application ring (Drizzle/schema + another module's helpers in
 *       service.ts), a WARNING for hand-parsed query params, and NO finding for the allowed
 *       type-only row import or for missing rate limits / perf (not architecture).
 *   2 — reviewer-core purity: fs, process.env and a concrete provider from `llm/` inside the
 *       engine are CRITICAL; node:crypto / node:path / zod / contracts are fine; the sequential
 *       LLM loop and the empty-key fallback are perf / security, so out of scope. Prompt in
 *       Ukrainian → reply in Ukrainian with code left as-is.
 *   3 — calibration: a new `this.container.github()` on the known legacy `reviews/service.ts`
 *       edge is KNOWN-EXTENDED WARNING (not a NEW CRITICAL, pre-existing imports not reported),
 *       the contract lands in one vendored copy only, a merge-readiness rule sits in a
 *       component → verdict CONCERNS, not BLOCKED.
 *
 * Grounding gates name only the changed file, never the agent's own report format: the benchmark's
 * baseline (no agent prompt) must still reach the judge, or every baseline practice is empty and
 * the lift only measures the heading.
 *
 * agentTask hands the agent only the read tools it declares (Bash is stripped: evals run with
 * bypassPermissions on the live repo), so it cannot run `git diff`. The prompt therefore says the
 * change is not in the working tree and inlines it; the agent can still Read/Grep the repo at HEAD
 * (AGENTS.md, INSIGHTS.md, the skills' references, the files around the change) for context.
 */

const BRIEF_DIFF = fx("brief-stale-list.diff");
const HISTORY_FILE = fx("review-history.ts");
const SUMMARY_DIFF = fx("findings-summary.diff");

const NO_SHELL =
  "You have no shell in this session, so you cannot run git. The change is NOT applied to the " +
  "working tree — it is given below in full. Use Read / Grep / Glob on the repository (it is at " +
  "HEAD) for any context you need.";

export const cases: AgentCase[] = [
  {
    name: "server module: application ring reaching Drizzle and another module's internals is BLOCKED",
    kind: "quality",
    prompt: `Review this change for architecture before I commit it. ${NO_SHELL}

Scope: HEAD → working tree, 4 files, all in server/.

<diff>
${BRIEF_DIFF}
</diff>`,
    grounding: ["brief/service.ts"],
    practices: [
      "the verdict line says BLOCKED",
      "a CRITICAL finding cites server/src/modules/brief/service.ts with a line number for the new `drizzle-orm` / `db/schema.js` import or the `this.deps.db.select(...)` query, and names the rule that application code (service) must not depend on Drizzle / the schema / infrastructure",
      "a CRITICAL finding cites `import { taskLine } from '../reviews/helpers.js'` in server/src/modules/brief/service.ts as a module importing another module's internals (the reviews module), with a fix that removes that import (through a types.ts facade, the contracts, or computing the value inside the brief module)",
      "the fix for the query moves it into the brief repository (BriefRepository) behind a new method on the BriefStore port in ports.ts, and removes the `db` dependency from BriefServiceDeps / wiring.ts",
      "the hand-rolled `req.query as { limit?: string }` / `Number(query.limit ...)` parsing in server/src/modules/brief/routes.ts is reported as WARNING (not CRITICAL), with the fix of a Zod `querystring` (and response) schema on the route",
      "the brief findings are marked Status NEW, not KNOWN-EXTENDED",
      "the import findings are marked as also enforced by dependency-cruiser",
      "no finding is raised against `import type { PullRow } from '../../db/rows.js'`; the type-only row import is either not mentioned or explicitly called allowed",
      "the answer contains no finding about rate limiting, the missing per-route rate limit, query performance, pagination cost or the loop that stops at `limit` — those are left out as non-architecture",
      "every finding has a Rule line, an Evidence line with `path:line` and the quoted offending code, and a concrete Fix line",
    ],
    threshold: 0.7,
    maxTurns: 25,
  },
  {
    name: "reviewer-core: I/O, env and a concrete provider in the pure engine (Ukrainian request)",
    kind: "quality",
    prompt: `Перевір архітектуру нового файлу в reviewer-core перед комітом. ${NO_SHELL}

Scope: один новий (untracked) файл \`reviewer-core/src/review/history.ts\`; більше нічого не змінено.

<file path="reviewer-core/src/review/history.ts">
${HISTORY_FILE}
</file>`,
    grounding: ["history.ts"],
    practices: [
      "the verdict line says BLOCKED",
      "the prose of the review (titles, impact, fix explanations) is in Ukrainian, while code, paths and identifiers such as `process.env` and `readFile` are left as-is",
      "a CRITICAL finding cites `import { readFile } from 'node:fs/promises'` (or the `readFile(...)` call) in reviewer-core/src/review/history.ts as filesystem I/O in the pure engine",
      "a CRITICAL finding cites the `process.env` reads (DEVDIGEST_HISTORY_DIR, DEVDIGEST_DEDUPE_MODEL or OPENROUTER_API_KEY) as env access inside reviewer-core",
      "a CRITICAL finding cites `import { OpenRouterProvider } from '../llm/openrouter.js'` / `new OpenRouterProvider(...)` as engine code using the adapter area or a concrete vendor provider instead of an injected LLMProvider",
      "the fix makes the caller inject the dependencies — the prior findings (or a history port) and an LLMProvider plus model passed in as parameters — and moves file reading, env and provider construction to the server / composition root",
      "the layer map places history.ts in the engine (src/review/), not in the src/llm/ adapter area",
      "no finding is raised against `node:crypto`, `node:path`, `zod` or the `@devdigest/shared` type import",
      "the answer contains no finding about the sequential `await isSameIssue(...)` calls in `dedupeAgainst`, about the empty-string API key fallback or about the unvalidated `JSON.parse` — performance and security are left out",
    ],
    threshold: 0.7,
    maxTurns: 25,
  },
  {
    name: "cross-package change on a legacy edge: KNOWN-EXTENDED, one contract copy, logic in a component → CONCERNS",
    kind: "quality",
    prompt: `Architecture review of my working-tree change, please. ${NO_SHELL}

Scope: HEAD → working tree, 10 files in server/ and client/.

<diff>
${SUMMARY_DIFF}
</diff>`,
    grounding: ["reviews/service.ts"],
    practices: [
      "the verdict line says CONCERNS (not BLOCKED, not PASS), and no finding is CRITICAL",
      "the new `this.container.github()` call in `findingsSummary` in server/src/modules/reviews/service.ts is reported with Status KNOWN-EXTENDED and severity WARNING, citing the new line",
      "the pre-existing `import type { Container }` and `new ReviewRepository(...)` in server/src/modules/reviews/service.ts are not reported as new findings of this change",
      "the fix for the container read passes GitHub access to the service as an explicit narrow dependency (a deps function or port built where the service is assembled) instead of reading `this.container`",
      "a WARNING finding says `PrFindingsSummary` was added only to server/src/vendor/shared/contracts/findings.ts while client/src/lib/hooks/reviews.ts imports it from `@devdigest/shared`, so client/src/vendor/shared must get the same contract",
      "a WARNING finding cites the `isReady` merge-readiness rule (`data.critical === 0 && data.warning <= 2 ...`) in FindingsSummaryBar.tsx as a business rule inside a component, with the fix of a named pure function (e.g. in the component's helpers.ts) or deciding it on the server",
      "the client data path (`usePrFindingsSummary` → `api.get` in src/lib/hooks/reviews.ts) and the new route with Zod `params` / `response` schemas in server/src/modules/reviews/routes.ts are not reported as violations",
      "the answer contains no style, naming, i18n-wording, performance or security findings",
    ],
    threshold: 0.7,
    maxTurns: 25,
  },
];
