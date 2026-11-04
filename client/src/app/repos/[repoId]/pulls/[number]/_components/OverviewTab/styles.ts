import type { CSSProperties } from "react";

export const s = {
  briefRow: {
    display: "grid",
    // 525 = the former 420 px minimum + 25% (wider Intent / Blast Radius cards);
    // `min(…, 100%)` lets a single column shrink on narrow screens instead of overflowing.
    gridTemplateColumns: "repeat(auto-fit, minmax(min(525px, 100%), 1fr))",
    alignItems: "start",
    gap: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
