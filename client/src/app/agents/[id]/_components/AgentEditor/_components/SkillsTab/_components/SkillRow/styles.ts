import type { CSSProperties } from "react";

/** Co-located styles for SkillRow. */
export const s = {
  row: (isLinked: boolean, isDragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid " + (isDragging ? "var(--accent)" : "var(--border)"),
    background: isLinked ? "var(--bg-elevated)" : "var(--bg-surface)",
    boxShadow: isDragging ? "var(--shadow-modal)" : undefined,
  }),
  handleSlot: { width: 18, flexShrink: 0, display: "inline-flex" } satisfies CSSProperties,
  name: (isDimmed: boolean): CSSProperties => ({
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    opacity: isDimmed ? 0.55 : 1,
  }),
  disabled: { fontSize: 12, color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
  type: (color: string, bg: string): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color,
    background: bg,
    padding: "1px 8px",
    borderRadius: 4,
    flexShrink: 0,
  }),
  position: { width: 28, textAlign: "right", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
