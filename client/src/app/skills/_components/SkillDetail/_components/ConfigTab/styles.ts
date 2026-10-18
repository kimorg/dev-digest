import type { CSSProperties } from "react";

/** Co-located styles for the skill Config tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  bodyMeta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
} as const;
