/**
 * Non-model tests for the contrast fence: the path predicate the PreToolUse hook and the read
 * trace share, and which files a snapshot keeps.
 *   pnpm vitest run src/runtime/sandbox.test.ts
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { isHarnessPath, isInside, outsidePath } from "./sandbox.js";

const base = realpathSync(mkdtempSync(join(tmpdir(), "sandbox-test-")));
const root = join(base, "root");
const outside = join(base, "outside");
mkdirSync(join(root, "docs"), { recursive: true });
mkdirSync(outside, { recursive: true });
writeFileSync(join(root, "docs", "a.md"), "a");
writeFileSync(join(outside, "secret.md"), "s");
symlinkSync(outside, join(root, "link-out"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("isInside", () => {
  test("root itself, a file below it, a relative path and a missing file below it are inside", () => {
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, join(root, "docs", "a.md"))).toBe(true);
    expect(isInside(root, "docs/a.md")).toBe(true);
    expect(isInside(root, join(root, "docs", "missing.md"))).toBe(true);
  });

  test("an absolute path elsewhere, a .. escape and a sibling with the same prefix are outside", () => {
    expect(isInside(root, join(outside, "secret.md"))).toBe(false);
    expect(isInside(root, "../outside/secret.md")).toBe(false);
    expect(isInside(root, `${root}-sibling/x.md`)).toBe(false);
  });

  test("a symlink inside root that points outside is judged by its target", () => {
    expect(isInside(root, join(root, "link-out", "secret.md"))).toBe(false);
  });
});

describe("outsidePath", () => {
  test("Read / Grep inside root pass, outside paths are returned", () => {
    expect(outsidePath(root, "Read", { file_path: join(root, "docs", "a.md") })).toBeUndefined();
    expect(outsidePath(root, "Grep", { pattern: "../etc", path: root })).toBeUndefined(); // regex, not a path
    expect(outsidePath(root, "Grep", { pattern: "x" })).toBeUndefined(); // no path → cwd
    expect(outsidePath(root, "Read", { file_path: "/etc/hosts" })).toBe("/etc/hosts");
    expect(outsidePath(root, "Grep", { pattern: "x", path: "/tmp" })).toBe("/tmp");
  });

  test("Glob: relative pattern passes; absolute, .. and brace-.. patterns are caught", () => {
    expect(outsidePath(root, "Glob", { pattern: "**/*.md" })).toBeUndefined();
    expect(outsidePath(root, "Glob", { pattern: "/home/**/AGENTS.md" })).toBeDefined();
    expect(outsidePath(root, "Glob", { pattern: "../**/*.md" })).toBe("../**/*.md");
    expect(outsidePath(root, "Glob", { pattern: "{docs,../outside}/*.md" })).toBe("{docs,../outside}/*.md");
    expect(outsidePath(root, "Glob", { pattern: "*.md", path: outside })).toBe(outside);
  });

  test("tools other than Read / Grep / Glob are not judged", () => {
    expect(outsidePath(root, "Skill", { path: "/etc" })).toBeUndefined();
  });
});

describe("isHarnessPath", () => {
  test("CLAUDE.md / AGENTS.md at any depth, .claude/ and .mcp.json are harness", () => {
    for (const p of ["CLAUDE.md", "AGENTS.md", "server/AGENTS.md", "client/CLAUDE.md", ".claude/agents/x.md", ".mcp.json"]) {
      expect(isHarnessPath(p), p).toBe(true);
    }
  });

  test("docs, READMEs and INSIGHTS.md are repo content, not harness", () => {
    for (const p of ["README.md", "server/README.md", "server/INSIGHTS.md", "docs/agent-prompts/README.md", "TESTING.md"]) {
      expect(isHarnessPath(p), p).toBe(false);
    }
  });
});
