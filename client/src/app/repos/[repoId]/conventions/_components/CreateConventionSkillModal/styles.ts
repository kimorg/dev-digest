import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px 4px" } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    marginBottom: 20,
    borderRadius: 8,
    background: "var(--accent-bg)",
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent-text)", flexShrink: 0 } satisfies CSSProperties,
  accent: { color: "var(--accent-text)" } satisfies CSSProperties,
  strong: { color: "var(--text-primary)" } satisfies CSSProperties,
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 } satisfies CSSProperties,
  toggleRow: { paddingTop: 6 } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerNote: { flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
