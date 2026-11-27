/**
 * Case types + the runners that turn a data array into vitest tests. This module owns the ONE
 * true measure → (log) → assert body, so case authors never rewrite it — which is exactly what
 * keeps the "assert before record" bug from recurring once record() lands (T2 slots into the
 * marked spot below, in this one file).
 */

import { rmSync } from "node:fs";
import { test, expect } from "vitest";
import { DEFAULT_THRESHOLD } from "../config.js";
import { skillTask, agentTask, workflowTask } from "../tasks.js";
import { runClaude, type Result, type RunOptions } from "../runtime/run-claude.js";
import { makeSnapshot } from "../runtime/sandbox.js";
import { patternMatch } from "../scoring/pattern-match.js";
import { llmJudge, type Verdict } from "../scoring/llm-judge.js";
import { logTrace, logVerdict } from "../logging/log.js";
import { record } from "../records/record.js";

// --- Case shapes ------------------------------------------------------------

/** A judge-and-grounding case. Same shape for skills and agents; only the task differs. */
export interface QualityCase {
  name: string;
  kind?: "quality" | "grounding";
  prompt: string;
  /** Practices the judge scores (quality). Omit for a pure grounding case. */
  practices?: string[];
  /** Substrings that must ALL appear before the judge runs (cheap-tier gate). */
  grounding?: string[];
  /** Judge score gate (default 0.6). */
  threshold?: number;
  maxTurns?: number;
}
export type SkillCase = QualityCase;
export type AgentCase = QualityCase;

/** A trace-asserted workflow case — a discriminated union routed by `kind`. */
export type WorkflowCase =
  | { kind: "dispatch"; name: string; prompt: string; expectSubagent: string; maxTurns?: number }
  | {
      kind: "activation";
      name: string;
      prompt: string;
      skill: string;
      shouldActivate: boolean;
      maxTurns?: number;
    }
  | {
      kind: "contrast";
      name: string;
      prompt: string;
      expectFileRead: string;
      tools?: string[];
      maxTurns?: number;
    }
  | {
      // A single-session composite: run ONE workflowTask and assert several trace facets at once.
      // Cheaper than separate dispatch/activation/contrast cases (one session, not N) at the cost
      // of coarser diagnostics and no control run — use contrast when you must isolate CLAUDE.md's
      // contribution. Every provided expectation must hold; omitted fields are not checked.
      kind: "trace";
      name: string;
      prompt: string;
      expectSubagents?: string[];
      expectSkills?: string[];
      expectFilesRead?: string[];
      /**
       * Files that must NOT be read (path substrings) — the negative half of a routing rule, e.g.
       * "read THIS package's INSIGHTS.md, not another's". Without it a model that reads everything
       * passes. Setting it disables the early stop on success: the session runs to its natural end
       * (or stops at the first forbidden read), so give the case enough maxTurns to finish.
       */
      avoidFilesRead?: string[];
      maxTurns?: number;
    };

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(result: Pick<Result, "skillsInvoked" | "filesRead">, skill: string): boolean {
  const bySkill = result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  const byRead = result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
  return bySkill || byRead;
}

// --- Runners ----------------------------------------------------------------

type Task = (prompt: string, artifact: string, opts?: RunOptions) => Promise<Result>;

function runQualityCases(artifact: string, cases: QualityCase[], task: Task): void {
  for (const c of cases) {
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      const result = await task(c.prompt, artifact, { maxTurns: c.maxTurns });
      logTrace(c.name, result);

      // measure → record → assert. Everything measurable runs in the try; record() fires in the
      // finally with whatever accumulated; the asserts happen strictly after. A failing config
      // (e.g. baseline: grounding gate fails, judge skipped) still leaves a record.
      let grounded: number | undefined;
      let verdict: Verdict | undefined;
      try {
        // Cheap deterministic tier first — the grounding gate. When it fails the judge is skipped.
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          logVerdict(c.name, verdict);
        }
      } finally {
        record(c.name, { result, verdict, grounded, threshold });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(threshold);
      }
    });
  }
}

export const runSkillCases = (skill: string, cases: SkillCase[]) => runQualityCases(skill, cases, skillTask);
export const runAgentCases = (agent: string, cases: AgentCase[]) => runQualityCases(agent, cases, agentTask);

export function runWorkflowCases(cases: WorkflowCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      if (c.kind === "dispatch") {
        // Stop the moment the subagent is launched — no need to wait out its nested session.
        const expect1 = c.expectSubagent;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) => p.subagents.includes(expect1),
        });
        logTrace(c.name, result);
        // `passed` flips only after every expect holds, so the record carries the real verdict
        // (record() alone would fall back to !isError and log a failed case as a pass).
        let passed = false;
        try {
          expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(c.expectSubagent);
          passed = true;
        } finally {
          record(c.name, { result, outcome: passed });
        }
      } else if (c.kind === "activation") {
        // A positive case stops the moment the skill engages — its own run (reading SKILL.md,
        // scripts) is not what is measured. A negative case must run to its natural end: an
        // early stop could hide an activation that comes later.
        const skill = c.skill;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: c.shouldActivate ? (p) => activated(p, skill) : undefined,
        });
        logTrace(c.name, result);
        let passed = false;
        try {
          expect(
            activated(result, c.skill),
            `skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
          ).toBe(c.shouldActivate);
          passed = true;
        } finally {
          record(c.name, { result, outcome: passed });
        }
      } else if (c.kind === "trace") {
        // One session, many asserts — every provided expectation is checked against the same trace.
        // Stop as soon as ALL expectations are satisfied (e.g. doc read + subagent launched), so a
        // dispatch-bearing trace doesn't pay for the nested subagent's full run.
        const subs = c.expectSubagents ?? [];
        const skls = c.expectSkills ?? [];
        const files = c.expectFilesRead ?? [];
        const avoid = c.avoidFilesRead ?? [];
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          // With an avoid-list, stopping at the first success would hide a forbidden read that comes
          // after it — so stop only once the case has already failed (a forbidden read).
          stopWhen: (p) =>
            avoid.length > 0
              ? avoid.some((f) => p.filesRead.some((r) => r.includes(f)))
              : subs.every((s) => p.subagents.includes(s)) &&
                skls.every((s) => activated(p, s)) &&
                files.every((f) => p.filesRead.some((r) => r.includes(f))),
        });
        logTrace(c.name, result);
        let passed = false;
        try {
          for (const sub of c.expectSubagents ?? []) {
            expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(sub);
          }
          for (const skill of c.expectSkills ?? []) {
            expect(
              activated(result, skill),
              `skill ${skill} not engaged | skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
            ).toBe(true);
          }
          for (const file of c.expectFilesRead ?? []) {
            expect(
              result.filesRead.some((f) => f.includes(file)),
              `${file} not read | reads: ${result.filesRead.join(", ")}`,
            ).toBe(true);
          }
          for (const file of avoid) {
            expect(
              result.filesRead.some((f) => f.includes(file)),
              `${file} must NOT be read | reads: ${result.filesRead.join(", ")}`,
            ).toBe(false);
          }
          expect(result.isError).toBe(false);
          passed = true;
        } finally {
          record(c.name, { result, outcome: passed });
        }
      } else {
        // contrast: the SAME repo snapshot with vs without the harness (CLAUDE.md / AGENTS.md /
        // .claude / .mcp.json), evals/ left out of both so no run reads the expected answer off a
        // case file. Each session is fenced to its snapshot (sandbox.ts) — an empty-tmpdir control
        // used to Grep /tmp, find the repo path and Read the real repo.
        const tools = c.tools ?? ["Read", "Grep", "Glob"];
        const full = makeSnapshot({ stripHarness: false });
        const bare = makeSnapshot({ stripHarness: true });
        try {
          const treatment = await workflowTask(c.prompt, {
            allowedTools: tools,
            maxTurns: c.maxTurns,
            cwd: full,
            confineTo: full,
          });
          const control = await runClaude(c.prompt, {
            allowedTools: tools,
            maxTurns: c.maxTurns,
            cwd: bare,
            confineTo: bare,
            settingSources: [],
          });
          logTrace(`${c.name} [treatment]`, treatment);
          logTrace(`${c.name} [control]`, control);
          // Both rows share one nodeid (the test name), so both carry the case's verdict — a
          // per-arm outcome would make the pass rate of that nodeid mean nothing.
          let passed = false;
          try {
            const treatmentRead = treatment.filesRead.some((f) => f.includes(c.expectFileRead));
            const controlRead = control.filesRead.some((f) => f.includes(c.expectFileRead));
            expect(treatmentRead, `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
            expect(controlRead, `control reads: ${control.filesRead.join(", ")}`).toBe(false);
            passed = true;
          } finally {
            record(`${c.name} [treatment]`, { result: treatment, outcome: passed });
            record(`${c.name} [control]`, { result: control, outcome: passed });
          }
        } finally {
          rmSync(full, { recursive: true, force: true });
          rmSync(bare, { recursive: true, force: true });
        }
      }
    });
  }
}
