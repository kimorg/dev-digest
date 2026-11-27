/**
 * Filesystem fence for the `contrast` tier: repo snapshots (with / without the harness) and a
 * PreToolUse hook that keeps Read / Grep / Glob inside one directory.
 *
 * Why: Read / Grep / Glob accept absolute paths, so a cwd alone isolates nothing. A control
 * session in an empty tmpdir Grep'ed /tmp, found Claude Code temp files naming the repo path and
 * then Read the real repo (2026-11-26). The hook is an SDK callback, not a settings.json hook:
 * the control runs with settingSources: [] and would never load one from disk.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { HookCallbackMatcher } from "@anthropic-ai/claude-agent-sdk";
import { REPO_ROOT } from "../artifacts/paths.js";
import { HARNESS_BASENAMES, HARNESS_PREFIXES, SNAPSHOT_EXCLUDE } from "../config.js";

/** Tools whose path-like inputs the fence checks. */
export const CONFINED_TOOLS = ["Read", "Grep", "Glob"];

/** Real path of `p`; for a missing path, the real path of its nearest existing ancestor + the rest. */
function realish(p: string): string {
  let head = p;
  const tail: string[] = [];
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) break;
    tail.unshift(basename(head));
    head = parent;
  }
  try {
    return join(realpathSync(head), ...tail);
  } catch {
    return p;
  }
}

/** True when `p` (relative paths resolve against `root`) lies at or below `root`, links followed. */
export function isInside(root: string, p: string): boolean {
  const rel = relative(realish(root), realish(resolve(root, p)));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** A `..` segment anywhere in a glob, including inside braces: `{a,../b}`. */
const DOTDOT_SEGMENT = /(^|[\\/{,])\.\.([\\/},]|$)/;

/** An absolute alternative inside braces: `{docs,/etc}/*` (resolve() would keep it under root). */
const BRACE_ABSOLUTE = /[{,][\\/]/;

/**
 * The first path a Read / Grep / Glob call would reach outside `root`, or undefined when it stays
 * inside. Grep's `pattern` is a regex (not a path); Glob's is resolved against its `path`.
 */
export function outsidePath(root: string, toolName: string, input: Record<string, unknown>): string | undefined {
  if (!CONFINED_TOOLS.includes(toolName)) return undefined;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
  const targets: string[] = [];
  const filePath = str(input.file_path);
  const path = str(input.path);
  if (filePath) targets.push(filePath);
  if (path) targets.push(path);
  const pattern = str(input.pattern);
  if (toolName === "Glob" && pattern) {
    if (DOTDOT_SEGMENT.test(pattern) || BRACE_ABSOLUTE.test(pattern)) return pattern;
    targets.push(resolve(path ? resolve(root, path) : root, pattern));
  }
  return targets.find((t) => !isInside(root, t));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * PreToolUse matcher that denies Read / Grep / Glob outside `root`. `onFailure: "block"` makes it
 * fail closed: a hook that throws blocks the call instead of letting it through.
 */
export function confineHook(root: string): HookCallbackMatcher {
  return {
    matcher: CONFINED_TOOLS.join("|"),
    onFailure: "block",
    hooks: [
      async (input) => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const { tool_name, tool_input } = input;
        // Fail closed: an input the fence cannot read is denied, never waved through.
        const outside = isRecord(tool_input)
          ? outsidePath(root, tool_name, tool_input)
          : CONFINED_TOOLS.includes(tool_name)
            ? `unreadable ${tool_name} input`
            : undefined;
        if (!outside) return {};
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Outside the working directory (${root}): ${outside}`,
          },
        };
      },
    ],
  };
}

/** Harness file = what `contrast` measures: CLAUDE.md / AGENTS.md at any depth, .claude/, .mcp.json. */
export function isHarnessPath(rel: string): boolean {
  return HARNESS_BASENAMES.includes(basename(rel)) || HARNESS_PREFIXES.some((p) => rel.startsWith(p));
}

/**
 * Copy the repo's working tree (tracked + untracked, minus git-ignored, minus SNAPSHOT_EXCLUDE)
 * into a fresh tmpdir and return its real path. `stripHarness` also leaves out the harness files,
 * so the control sees the same repo with no instructions. The caller removes the directory.
 */
export function makeSnapshot({ stripHarness }: { stripHarness: boolean }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), stripHarness ? "eval-snap-bare-" : "eval-snap-full-")));
  try {
    const files = execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    for (const rel of new Set(files)) {
      if (SNAPSHOT_EXCLUDE.some((p) => rel.startsWith(p))) continue;
      if (stripHarness && isHarnessPath(rel)) continue;
      const src = join(REPO_ROOT, rel);
      if (!existsSync(src)) continue; // deleted in the working tree but still in the index
      const dst = join(dir, rel);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(src, dst); // a symlink is copied as a link; the hook follows it and judges its target
    }
    return dir;
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // a half-made copy is the caller's leak otherwise
    throw e;
  }
}
