/**
 * All tunables in one place. No logic here — just the knobs the rest of the package reads.
 * Nothing in this module imports from another src module (it is the bottom of the dependency
 * graph): config knows nothing of runtime, scoring, or the SDK.
 */

// --- Backend ----------------------------------------------------------------
// "subscription" = Claude Agent SDK on the Claude Code login; "openrouter" = OpenRouter (see env.ts).
export const EVAL_BACKEND = process.env.EVAL_BACKEND ?? "subscription";
const ON_OPENROUTER = EVAL_BACKEND === "openrouter";

// --- Models -----------------------------------------------------------------
// Cheap model under test by default; the judge is a stronger family to soften self-preference.
// Defaults are "newest of the family" aliases, and the alias format differs per backend:
//   subscription — Agent SDK aliases "haiku" / "sonnet", resolved by the installed SDK
//                  (0.3.327: claude-haiku-5-5 / claude-sonnet-5-5); bumping the SDK moves them.
//   openrouter   — OpenRouter's "~anthropic/claude-*-latest" router aliases; OpenRouter rejects
//                  "haiku" / "sonnet" ("is not a valid model ID") on both /chat/completions and
//                  /v1/messages, while the "~" aliases are served on both.
// Pin a full ID (EVAL_MODEL=claude-haiku-5-5, or anthropic/claude-haiku-5.5 on OpenRouter) for
// benchmark runs that must stay comparable over time.
export const EVAL_MODEL = process.env.EVAL_MODEL ?? (ON_OPENROUTER ? "~anthropic/claude-haiku-latest" : "haiku");
export const EVAL_JUDGE_MODEL =
  process.env.EVAL_JUDGE_MODEL ?? (ON_OPENROUTER ? "~anthropic/claude-sonnet-latest" : "sonnet");
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");

// --- Configuration tag ------------------------------------------------------
// "candidate" = artifact injected (normal). "baseline" = no artifact (benchmark lift baseline).
export const EVAL_CONFIG = process.env.EVAL_CONFIG ?? "candidate";
export const IS_BASELINE = EVAL_CONFIG === "baseline";

// --- Scoring / statistics thresholds ---------------------------------------
export const DEFAULT_THRESHOLD = 0.6; // judge score gate for a quality case
export const FLAKY_LOW = 0.2; // pass rate strictly inside (20%, 80%) is "flaky"
export const FLAKY_HIGH = 0.8;
export const COST_REGRESSION_RATIO = 1.25; // candidate mean tokens > 125% of baseline

// --- Tool allow-lists -------------------------------------------------------
// Subagent-spawning tool name varies by harness; count both.
export const SPAWN_TOOLS = new Set(["Task", "Agent"]);
// workflowTask runs against the LIVE repo with bypassPermissions — keep this read-only.
export const WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"];

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);
