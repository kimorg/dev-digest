import type { CSSProperties } from "react";

/** Co-located styles for the skill Versions tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 16px", lineHeight: 1.45 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    marginBottom: 8,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  version: { fontWeight: 650 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
