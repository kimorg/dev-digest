/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 *
 * Practice identity: the judge answers by practice NUMBER, and every result carries the practice
 * text from the case file, never the judge's copy of it. Statistics key series by practice text
 * (records/stats.ts), and judges paraphrase when asked to echo it — a paraphrase would split one
 * practice into several series.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a numbered list of PRACTICES, judge " +
  "each practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) One result per practice; `id` is the practice's number in the list. Do not " +
  "repeat the practice text. (4) Reply with ONLY minified JSON:\n" +
  '{"results":[{"id":1,"passed":true,"evidence":"<verbatim quote>"}]}';

/** Evidence recorded for a practice the judge returned no result for. */
export const OMITTED_EVIDENCE = "judge returned no result for this practice";

export interface Verdict {
  /** One entry per practice, in case-file order; `practice` is the case file's text. */
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
  /** Model the provider actually served for the judge call (see Result.servedModel). */
  model?: string;
}

/** The judge's raw `results[]`, unvalidated. */
export function parseVerdict(text: string): unknown[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/**
 * Map the judge's raw results onto the case's practices: by `id` (1-based), else by an exact copy
 * of the practice text. A practice with no result is a FAIL with OMITTED_EVIDENCE; the first
 * result for an id wins; ids outside the list are ignored. Only `passed === true` passes.
 */
export function alignResults(raw: unknown[], practices: string[]): Verdict["results"] {
  const byIndex = new Map<number, { passed?: unknown; evidence?: unknown }>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as { id?: unknown; practice?: unknown; passed?: unknown; evidence?: unknown };
    const id = typeof r.id === "number" ? r.id : typeof r.id === "string" ? Number(r.id) : NaN;
    const index = Number.isInteger(id) ? id - 1 : practices.indexOf(String(r.practice ?? ""));
    if (index < 0 || index >= practices.length || byIndex.has(index)) continue;
    byIndex.set(index, r);
  }
  return practices.map((practice, i) => {
    const r = byIndex.get(i);
    if (!r) return { practice, passed: false, evidence: OMITTED_EVIDENCE };
    return { practice, passed: r.passed === true, evidence: typeof r.evidence === "string" ? r.evidence : "" };
  });
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 1, model });
  const results = alignResults(parseVerdict(res.text), practices);
  const total = practices.length || 1;
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, total, score: passed / total, model: res.servedModel };
}
