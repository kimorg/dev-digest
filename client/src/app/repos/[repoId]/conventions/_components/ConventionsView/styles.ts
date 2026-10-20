import type { CSSProperties } from "react";

export const s = {
  container: { padding: "32px 32px 56px", maxWidth: 1180, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 } satisfies CSSProperties,
  title: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  failed: { fontSize: 13, color: "var(--crit)", marginTop: 4 } satisfies CSSProperties,
  actions: { marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
} as const;
