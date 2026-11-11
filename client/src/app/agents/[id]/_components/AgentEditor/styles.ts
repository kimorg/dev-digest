import type { CSSProperties } from "react";

/** Co-located styles for the AgentEditor shell. */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  /** The Context tab fills the body: no scroll, no bottom padding, so its preview panel can reach the window bottom. */
  body: (isFill: boolean): CSSProperties =>
    isFill
      ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", padding: "28px 28px 0" }
      : { flex: 1, overflow: "auto", padding: 28 },
} as const;
