import type { CSSProperties } from "react";

/** Co-located styles for SortableSkillRow. */
export const s = {
  item: (transform: string | undefined, transition: string | undefined, isDragging: boolean): CSSProperties => ({
    transform,
    transition,
    position: "relative",
    zIndex: isDragging ? 1 : undefined,
  }),
  handle: (isDragDisabled: boolean, isDragging: boolean): CSSProperties => ({
    display: "inline-flex",
    padding: 0,
    border: "none",
    background: "none",
    color: "var(--text-muted)",
    cursor: isDragDisabled ? "not-allowed" : isDragging ? "grabbing" : "grab",
    touchAction: "none",
  }),
} as const;
