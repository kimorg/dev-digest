import type { CSSProperties } from "react";

export const s = {
  item: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-base)",
  } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 10px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-primary)",
    fontSize: 13,
    textAlign: "left",
  } satisfies CSSProperties,
  name: { fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "0 10px 10px 28px",
  } satisfies CSSProperties,
  callers: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 13,
  } satisfies CSSProperties,
  caller: { display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 } satisfies CSSProperties,
  arrow: { flexShrink: 0 } satisfies CSSProperties,
  // Path + caller name flow as inline text: wraps at the <wbr> after each "/";
  // `anywhere` is the fallback for a single segment longer than the card.
  callerText: { minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  callerName: { color: "var(--text-muted)", fontSize: 12.5, marginLeft: 8 } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6, minWidth: 0 } satisfies CSSProperties,
  // Badge is `nowrap` by default; a long endpoint or cron must wrap inside the card.
  chip: { maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
