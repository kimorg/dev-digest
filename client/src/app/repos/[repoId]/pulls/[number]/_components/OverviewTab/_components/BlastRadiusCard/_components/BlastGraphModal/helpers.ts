import type { GraphEdge, GraphHighlight } from "./graph-layout";
import { COLUMN_COLOR } from "./styles";

/** `idle` = nothing hovered; `active` = the hovered symbol; `linked` = its downstream; `dimmed` = the rest. */
export type NodeState = "idle" | "active" | "linked" | "dimmed";

export function nodeState(id: string, highlight: GraphHighlight | null, hovered: string | null): NodeState {
  if (!highlight) return "idle";
  if (id === hovered) return "active";
  return highlight.nodes.has(id) ? "linked" : "dimmed";
}

/** SVG stroke props: highlighted edges turn violet and solid, the others fade out. */
export function edgeStroke(
  edge: GraphEdge,
  highlight: GraphHighlight | null,
): { stroke: string; strokeOpacity: number; strokeWidth: number } {
  if (!highlight) return { stroke: COLUMN_COLOR[edge.column], strokeOpacity: 0.55, strokeWidth: 1.5 };
  return highlight.edges.has(edge.id)
    ? { stroke: COLUMN_COLOR.symbols, strokeOpacity: 1, strokeWidth: 2 }
    : { stroke: COLUMN_COLOR[edge.column], strokeOpacity: 0.1, strokeWidth: 1.5 };
}
