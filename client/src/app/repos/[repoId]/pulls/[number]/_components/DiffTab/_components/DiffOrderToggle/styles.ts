import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "inline-flex",
    gap: 2,
    padding: 2,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
} as const;
