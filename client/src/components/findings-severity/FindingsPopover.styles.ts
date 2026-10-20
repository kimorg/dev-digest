import type { CSSProperties } from "react";
import { POPOVER_EDGE, POPOVER_MAX_HEIGHT, POPOVER_WIDTH } from "./constants";
import type { Placement } from "./helpers";

/** Styles for FindingsPopover. */
export const s = {
  root: (p: Placement): CSSProperties => ({
    position: "fixed",
    left: p.left,
    top: p.top,
    bottom: p.bottom,
    width: POPOVER_WIDTH,
    maxWidth: `calc(100vw - ${POPOVER_EDGE * 2}px)`,
    maxHeight: POPOVER_MAX_HEIGHT,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: "12px 14px",
    zIndex: 60,
    animation: "ddpop .12s ease",
    cursor: "default",
    textAlign: "left",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  item: (first: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 0",
    borderTop: first ? "none" : "1px solid var(--border)",
  }),
  titleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  rationale: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
