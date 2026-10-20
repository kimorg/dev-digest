import type { CSSProperties } from "react";

/** Styles for FindingsSeverityCounts. */
export const s = {
  wrap: (hover: boolean, open: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    ...(hover && {
      padding: "2px 4px",
      margin: "-2px -4px",
      borderRadius: 4,
      background: open ? "var(--bg-hover)" : "none",
      cursor: "default",
    }),
  }),
  button: (color: string, open: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 0",
    border: "none",
    borderBottom: `1px dotted ${color}`,
    background: open ? "var(--bg-hover)" : "none",
    borderRadius: 0,
    color,
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  }),
  count: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "1px 0",
    borderBottom: `1px dotted ${color}`,
    color,
    fontSize: 13,
    fontWeight: 600,
  }),
  none: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
