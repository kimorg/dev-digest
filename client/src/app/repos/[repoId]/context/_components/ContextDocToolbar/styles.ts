import type { CSSProperties } from "react";

export const s = {
  bar: { display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", flexShrink: 0 } satisfies CSSProperties,
  hintWrap: { position: "relative", display: "inline-flex" } satisfies CSSProperties,
  tooltip: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 6,
    zIndex: 10,
    width: 240,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    fontSize: 12,
    lineHeight: 1.4,
    boxShadow: "var(--shadow-modal)",
  } satisfies CSSProperties,
} as const;
