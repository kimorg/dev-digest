import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  status: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
