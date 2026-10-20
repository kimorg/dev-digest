import type { CSSProperties } from "react";

/** Co-located styles for the agent Skills tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "baseline", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", margin: "6px 0 14px" } satisfies CSSProperties,
  filter: {
    width: "100%",
    padding: "8px 12px",
    marginBottom: 12,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 13,
    outline: "none",
  } satisfies CSSProperties,
  filterNote: { fontSize: 12, color: "var(--text-muted)", margin: "-4px 0 10px" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
} as const;
