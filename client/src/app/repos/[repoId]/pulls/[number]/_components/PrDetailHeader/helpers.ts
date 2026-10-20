import type { PrDetail } from "@/lib/types";

/** Merged or closed: a review is informational only and can't change the code. */
export function isPrClosed(status: PrDetail["status"]): boolean {
  return status === "merged" || status === "closed";
}
