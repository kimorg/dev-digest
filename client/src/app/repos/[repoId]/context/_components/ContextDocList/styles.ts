import type { CSSProperties } from "react";

export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    padding: "0 8px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 1,
  } satisfies CSSProperties,
  row: (isSelected: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minWidth: 0,
    textAlign: "left",
    padding: "6px 10px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    color: isSelected ? "var(--accent-text)" : "var(--text-secondary)",
    background: isSelected ? "var(--bg-hover)" : "transparent",
  }),
  icon: { flexShrink: 0 } satisfies CSSProperties,
  path: {
    fontSize: 12.5,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
