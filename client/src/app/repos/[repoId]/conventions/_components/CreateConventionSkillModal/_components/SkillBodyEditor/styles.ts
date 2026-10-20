import type { CSSProperties } from "react";

const LINE_HEIGHT = "21px";
const FONT_SIZE = 13;

export const s = {
  frame: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", height: 300 } satisfies CSSProperties,
  gutter: {
    flexShrink: 0,
    minWidth: 44,
    padding: "12px 10px 12px 0",
    textAlign: "right",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: "var(--text-muted)",
    overflow: "hidden",
    userSelect: "none",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    resize: "none",
    padding: "12px 14px 12px 6px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    whiteSpace: "pre",
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
