import type { CSSProperties } from "react";
import { OVERVIEW_MAX_WIDTH, PR_BODY_MAX_WIDTH } from "./constants";

/** Co-located styles for PrDetailView. */
export const s = {
  loading: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: PR_BODY_MAX_WIDTH,
    margin: "0 auto",
  } satisfies CSSProperties,
  /** `wide` = Overview tab (wider Intent / Blast Radius cards). */
  body: (wide: boolean): CSSProperties => ({
    padding: "24px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: wide ? OVERVIEW_MAX_WIDTH : PR_BODY_MAX_WIDTH,
    margin: "0 auto",
  }),
} as const;
