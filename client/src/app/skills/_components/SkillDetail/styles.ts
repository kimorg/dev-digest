import type { CSSProperties } from "react";

/** Co-located styles for SkillDetail (header + tabs + body). */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  enabled: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  /** The Context tab fills the body: no scroll, no bottom padding, so its preview panel can reach the window bottom. */
  body: (isFill: boolean): CSSProperties =>
    isFill
      ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: "28px 28px 0" }
      : { flex: 1, overflow: "auto", padding: 28 },
} as const;
