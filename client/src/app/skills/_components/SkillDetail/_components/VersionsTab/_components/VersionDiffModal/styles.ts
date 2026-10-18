import type { CSSProperties } from "react";
import type { DiffRow } from "./helpers";

const ROW_BG: Record<DiffRow["kind"], string> = {
  add: "var(--code-add)",
  del: "var(--code-del)",
  same: "transparent",
  gap: "var(--bg-hover)",
};
const ROW_COLOR: Record<DiffRow["kind"], string> = {
  add: "var(--code-add-text)",
  del: "var(--code-del-text)",
  same: "var(--text-secondary)",
  gap: "var(--text-muted)",
};

/** Co-located styles for VersionDiffModal. */
export const s = {
  body: { padding: "12px 0", fontSize: 13 } satisfies CSSProperties,
  empty: { padding: "12px 24px", color: "var(--text-muted)" } satisfies CSSProperties,
  row: (kind: DiffRow["kind"]): CSSProperties => ({
    display: "flex",
    gap: 12,
    padding: "1px 24px",
    background: ROW_BG[kind],
    color: ROW_COLOR[kind],
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  }),
  sign: { width: 10, flexShrink: 0, userSelect: "none" } satisfies CSSProperties,
} as const;
