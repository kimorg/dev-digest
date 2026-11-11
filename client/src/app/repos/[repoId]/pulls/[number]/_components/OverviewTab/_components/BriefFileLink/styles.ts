import type { CSSProperties } from "react";

export const s = {
  link: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12.5,
    color: "var(--accent-text)",
    cursor: "pointer",
    textDecoration: "none",
    textAlign: "left",
    wordBreak: "break-all",
  } satisfies CSSProperties,
} as const;
