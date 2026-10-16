import type { CSSProperties } from "react";

/** Co-located styles for RunHistory (the timeline list). */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
