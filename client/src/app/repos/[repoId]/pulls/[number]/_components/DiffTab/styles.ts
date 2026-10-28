import type { CSSProperties } from "react";

export const s = {
  controls: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)", margin: "2px 0 10px" } satisfies CSSProperties,
  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" } satisfies CSSProperties,
} as const;
