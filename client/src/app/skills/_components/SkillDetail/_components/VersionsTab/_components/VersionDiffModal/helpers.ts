import { diffLines } from "diff";
import { DIFF_CONTEXT_LINES } from "./constants";

export type DiffRow =
  | { kind: "add" | "del" | "same"; text: string }
  | { kind: "gap"; count: number };

/**
 * Line diff of `from` → `to`, with unchanged runs longer than the context
 * collapsed into a `gap` row. No changes → `[]`.
 */
export function toDiffRows(from: string, to: string, context = DIFF_CONTEXT_LINES): DiffRow[] {
  const lines: { kind: "add" | "del" | "same"; text: string }[] = [];
  for (const part of diffLines(from, to)) {
    const kind = part.added ? "add" : part.removed ? "del" : "same";
    const text = part.value.endsWith("\n") ? part.value.slice(0, -1) : part.value;
    for (const line of text.split("\n")) lines.push({ kind, text: line });
  }
  if (!lines.some((l) => l.kind !== "same")) return [];

  // Keep a "same" line only when it is within `context` lines of a change.
  const near = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) near[j] = true;
  });
  const rows: DiffRow[] = [];
  let hidden = 0;
  lines.forEach((l, i) => {
    if (l.kind === "same" && !near[i]) {
      hidden++;
      return;
    }
    if (hidden > 0) rows.push({ kind: "gap", count: hidden });
    hidden = 0;
    rows.push(l);
  });
  if (hidden > 0) rows.push({ kind: "gap", count: hidden });
  return rows;
}
