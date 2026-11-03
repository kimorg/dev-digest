import type { CSSProperties } from "react";
import { COLUMN_WIDTH, HEADER_HEIGHT, NODE_HEIGHT, PADDING, SCROLL_PADDING, type GraphColumn } from "./graph-layout";
import type { NodeState } from "./helpers";

export const COLUMN_COLOR: Record<GraphColumn, string> = {
  symbols: "var(--violet)",
  callers: "var(--text-secondary)",
  endpoints: "var(--ok)",
  crons: "var(--warn)",
};

export const s = {
  canvas: (width: number, height: number): CSSProperties => ({
    position: "relative",
    width,
    height,
    margin: "0 auto",
  }),
  svg: { position: "absolute", inset: 0, pointerEvents: "none" } satisfies CSSProperties,
  header: (x: number, color: string): CSSProperties => ({
    position: "absolute",
    left: x,
    top: PADDING,
    width: COLUMN_WIDTH,
    height: HEADER_HEIGHT,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color,
  }),
  node: (x: number, y: number, color: string, state: NodeState): CSSProperties => ({
    opacity: state === "dimmed" ? 0.25 : 1,
    fontWeight: state === "active" ? 600 : undefined,
    boxShadow: state === "active" ? `0 0 0 1px ${color}` : undefined,
    transition: "opacity .15s ease",
    outline: "none",
    position: "absolute",
    left: x,
    top: y,
    width: COLUMN_WIDTH,
    height: NODE_HEIGHT,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 1,
    padding: "0 8px",
    border: `1px solid ${color}`,
    borderRadius: 6,
    background: "var(--bg-base)",
    fontSize: 12,
    overflow: "hidden",
  }),
  /** Each line of a node truncates on its own with an ellipsis. */
  nodeLine: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  nodeSub: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  empty: { padding: 24, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  scroll: { padding: SCROLL_PADDING, overflow: "auto" } satisfies CSSProperties,
} as const;
