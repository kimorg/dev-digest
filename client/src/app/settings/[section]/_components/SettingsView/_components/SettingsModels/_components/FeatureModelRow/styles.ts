import type { CSSProperties } from "react";

/** Co-located styles for FeatureModelRow (provider + model pickers on one line). */
export const s = {
  row: { marginBottom: 18 } satisfies CSSProperties,
  defaultTag: {
    marginLeft: 8,
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  pickers: { display: "flex", alignItems: "stretch", gap: 10 } satisfies CSSProperties,
  provider: { width: 160, flexShrink: 0 } satisfies CSSProperties,
  model: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  emptyHint: { marginTop: 4, color: "var(--warn)" } satisfies CSSProperties,
} as const;
