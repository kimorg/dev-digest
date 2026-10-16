import type { CSSProperties } from "react";

/** Co-located styles for FilterBar. */
export const s = {
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  filterChips: { display: "flex", gap: 8 } satisfies CSSProperties,
  filterActions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
} as const;
