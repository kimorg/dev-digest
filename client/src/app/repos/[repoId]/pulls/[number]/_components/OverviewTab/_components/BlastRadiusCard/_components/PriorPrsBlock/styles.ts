import type { CSSProperties } from "react";

export const s = {
  block: { borderTop: "1px solid var(--border)", paddingTop: 12 } satisfies CSSProperties,
  /** `canExpand` = at least one PR; otherwise the header is a disabled, non-clickable row. */
  toggle: (canExpand: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: 0,
    background: "none",
    border: "none",
    cursor: canExpand ? "pointer" : "default",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "left",
  }),
  /** Chevron keeps its slot (title stays aligned) but is hidden when there is nothing to expand. */
  chevron: (canExpand: boolean): CSSProperties => ({
    display: "inline-flex",
    visibility: canExpand ? "visible" : "hidden",
  }),
  list: {
    margin: "10px 0 0",
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  row: { display: "flex", flexDirection: "column", gap: 2, fontSize: 13 } satisfies CSSProperties,
  rowTitle: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
  muted: { marginTop: 10, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
