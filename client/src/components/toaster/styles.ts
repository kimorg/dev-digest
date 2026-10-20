import type { CSSProperties } from "react";

/** Co-located styles for Toaster. */
export const s = {
  stack: {
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    maxWidth: 380,
  } satisfies CSSProperties,
  toast: (bg: string, border: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 9,
    background: bg,
    border: `1px solid ${border}`,
    color: "var(--text-primary)",
    fontSize: 14,
    boxShadow: "0 6px 24px rgba(0,0,0,0.3)",
    animation: "ddToastIn .16s ease-out",
  }),
  glyph: (color: string): CSSProperties => ({ color, fontWeight: 700 }),
  message: { flex: 1 } satisfies CSSProperties,
  dismiss: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 16,
  } satisfies CSSProperties,
} as const;
