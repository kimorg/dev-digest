import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    // A grid item defaults to `min-width: auto`; 0 keeps long paths from widening the card.
    minWidth: 0,
  } satisfies CSSProperties,
  statRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  statEnd: { marginLeft: "auto" } satisfies CSSProperties,
  statNumber: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  tree: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  degraded: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
