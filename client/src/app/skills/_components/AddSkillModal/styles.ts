import type { CSSProperties } from "react";

/** Styles shared by the Add Skill modal and its two tab forms. */
export const s = {
  body: { padding: "20px 24px" } satisfies CSSProperties,
  submitRow: { marginTop: 4 } satisfies CSSProperties,
} as const;
