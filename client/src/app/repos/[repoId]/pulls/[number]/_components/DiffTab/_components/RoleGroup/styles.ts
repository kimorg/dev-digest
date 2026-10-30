import type { CSSProperties } from "react";
import { PR_HEADER_HEIGHT_VAR } from "../../../PrDetailHeader/constants";

export const s = {
  wrap: { marginBottom: 6 } satisfies CSSProperties,
  header: {
    position: "sticky",
    // Pins under the sticky PR header (z-index 5), whose height varies.
    top: `var(${PR_HEADER_HEIGHT_VAR}, 0px)`,
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  toggle: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, width: "auto" } satisfies CSSProperties,
  label: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  flagged: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--crit)",
  } satisfies CSSProperties,
  flaggedDot: { width: 8, height: 8, borderRadius: "50%", background: "var(--crit)" } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { paddingBottom: 8 } satisfies CSSProperties,
} as const;

export function swatchFor(color: string): CSSProperties {
  return { width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 };
}

export function chevronFor(open: boolean, dimmed: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    opacity: dimmed ? 0.35 : 1,
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}
