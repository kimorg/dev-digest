import type { BlastRadius } from "@devdigest/shared";

export type GraphColumn = "symbols" | "callers" | "endpoints" | "crons";

export const GRAPH_COLUMNS: readonly GraphColumn[] = ["symbols", "callers", "endpoints", "crons"];

export const COLUMN_WIDTH = 190;
export const COLUMN_GAP = 80;
/** Tall enough for a two-line caller box (name + `file:line`); single-line nodes centre vertically. */
export const NODE_HEIGHT = 40;
export const ROW_HEIGHT = 52;
export const HEADER_HEIGHT = 36;
export const PADDING = 16;
/** Padding of the modal's scroll box around the canvas (each side). */
export const SCROLL_PADDING = 8;
/** Modal border, both sides: the kit `Modal` is border-box with a 1px border. */
const MODAL_BORDER = 2;

export interface GraphNode {
  id: string;
  column: GraphColumn;
  label: string;
  /** Second, muted line — the caller's `file:line` with the file name only. */
  sublabel?: string;
  /** Full text for the hover tooltip (callers: the whole path). */
  title: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  /** Source and target node ids (for hover highlighting). */
  from: string;
  to: string;
  /** Edge colour follows the column it points into. */
  column: GraphColumn;
  /** SVG cubic Bézier path from the right edge of the source to the left edge of the target. */
  d: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: Record<GraphColumn, number>;
  width: number;
  height: number;
}

/** Last path segment: `"client/src/a/AgentCard.tsx"` → `"AgentCard.tsx"`. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Modal width that fits the canvas exactly, so no horizontal scrollbar unless the viewport is narrower. */
export function graphModalWidth(layout: Pick<GraphLayout, "width">): number {
  return layout.width + SCROLL_PADDING * 2 + MODAL_BORDER;
}

/** Left edge of a column. */
export function columnX(column: GraphColumn): number {
  return PADDING + GRAPH_COLUMNS.indexOf(column) * (COLUMN_WIDTH + COLUMN_GAP);
}

function curve(from: GraphNode, to: GraphNode): string {
  const x1 = from.x + COLUMN_WIDTH;
  const y1 = from.y + NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_HEIGHT / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

/**
 * Four fixed columns (symbols → callers → endpoints → crons), one row per node, edges as Bézier paths.
 * Pure: no DOM measurement, so it runs the same in the browser and in tests.
 */
export function layoutBlastGraph(blast: BlastRadius): GraphLayout {
  const factsByFile = new Map(blast.caller_facts.map((f) => [f.file, f]));
  const nodes = new Map<string, GraphNode>();
  const rows: Record<GraphColumn, number> = { symbols: 0, callers: 0, endpoints: 0, crons: 0 };

  const node = (
    column: GraphColumn,
    key: string,
    label: string,
    extra: { sublabel?: string; title?: string } = {},
  ): GraphNode => {
    const id = `${column}:${key}`;
    const existing = nodes.get(id);
    if (existing) return existing;
    const created: GraphNode = {
      id,
      column,
      label,
      ...(extra.sublabel ? { sublabel: extra.sublabel } : {}),
      title: extra.title ?? label,
      x: columnX(column),
      y: PADDING + HEADER_HEIGHT + rows[column]++ * ROW_HEIGHT,
    };
    nodes.set(id, created);
    return created;
  };

  const edges = new Map<string, GraphEdge>();
  const edge = (from: GraphNode, to: GraphNode) => {
    const id = `${from.id}->${to.id}`;
    if (!edges.has(id)) edges.set(id, { id, from: from.id, to: to.id, column: to.column, d: curve(from, to) });
  };

  for (const d of blast.downstream) {
    const symbol = node("symbols", d.symbol, d.symbol);
    for (const c of d.callers) {
      // Full paths don't fit a 190px box: show the file name only; the tooltip keeps the whole path.
      const caller = node("callers", `${c.file}:${c.line}`, c.name, {
        sublabel: `${fileName(c.file)}:${c.line}`,
        title: `${c.name} · ${c.file}:${c.line}`,
      });
      edge(symbol, caller);
      const facts = factsByFile.get(c.file);
      for (const e of facts?.endpoints ?? []) edge(caller, node("endpoints", e, e));
      for (const k of facts?.crons ?? []) edge(caller, node("crons", k, k));
    }
  }

  const counts = { ...rows };
  const tallest = Math.max(1, ...Object.values(rows));
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    counts,
    width: PADDING * 2 + GRAPH_COLUMNS.length * COLUMN_WIDTH + (GRAPH_COLUMNS.length - 1) * COLUMN_GAP,
    height: PADDING * 2 + HEADER_HEIGHT + tallest * ROW_HEIGHT,
  };
}

export interface GraphHighlight {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

/**
 * Everything downstream of one node (symbol → its callers → their endpoints / crons), following
 * edges forward only, so a shared caller does not light up the other symbol. Pure.
 */
export function downstreamOf(layout: Pick<GraphLayout, "edges">, nodeId: string): GraphHighlight {
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of layout.edges) {
      if (e.from !== current) continue;
      edges.add(e.id);
      if (!nodes.has(e.to)) {
        nodes.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return { nodes, edges };
}
