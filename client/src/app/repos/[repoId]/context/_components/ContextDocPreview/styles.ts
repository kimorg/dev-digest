import type { CSSProperties } from "react";

export const s = {
  panel: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 20px",
    flexShrink: 0,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  path: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  usedBy: { marginLeft: "auto", flexShrink: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  markdown: { padding: "16px 20px", fontSize: 14 } satisfies CSSProperties,
  note: { padding: 16, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
