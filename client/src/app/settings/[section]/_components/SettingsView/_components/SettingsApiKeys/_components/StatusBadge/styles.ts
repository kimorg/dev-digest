import type { CSSProperties } from "react";

/** Co-located styles for StatusBadge. */
export const s = {
  badge: (configured: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: configured ? "var(--ok)" : "var(--text-muted)",
  }),
  badgeDot: (configured: boolean): CSSProperties => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: configured ? "var(--ok)" : "var(--text-muted)",
  }),
} as const;
