import type { CSSProperties } from "react";
import { DOCS_PANE_WIDTH } from "./constants";

export const s = {
  container: { display: "flex", flexDirection: "column", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  titleBar: { padding: "14px 24px", flexShrink: 0, borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" } satisfies CSSProperties,
  panes: { display: "flex", flex: 1, minHeight: 0 } satisfies CSSProperties,
  docsPane: {
    width: DOCS_PANE_WIDTH,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderRight: "1px solid var(--border)",
  } satisfies CSSProperties,
  listScroll: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  previewPane: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  fullArea: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  warn: { fontSize: 12.5, color: "var(--warn)", padding: "0 12px 8px", margin: 0 } satisfies CSSProperties,
  patterns: {
    margin: 0,
    padding: "0 24px 20px",
    listStyle: "none",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  statusBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    padding: "8px 16px",
    fontSize: 12,
    color: "var(--text-muted)",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  dot: { width: 8, height: 8, borderRadius: "50%", background: "var(--text-muted)" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8, padding: 12 } satisfies CSSProperties,
} as const;
