import type { ReviewRecord } from "@devdigest/shared";

/** The newest review that has a verdict (input newest-first, as GET /pulls/:id/reviews returns it). */
export function newestVerdictReview(reviews: ReviewRecord[] | undefined): ReviewRecord | undefined {
  return reviews?.find((r) => r.verdict != null);
}

/** 8200 → "8.2K", 1300000 → "1.3M", 640 → "640". */
function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const [div, unit] = n < 1_000_000 ? [1000, "K"] : [1_000_000, "M"];
  return `${(n / div).toFixed(1).replace(/\.0$/, "")}${unit}`;
}

/** "8.2K→1.3K"; null when neither count is known. */
export function formatTokenFlow(tokensIn: number | null, tokensOut: number | null): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  const part = (n: number | null) => (n == null ? "—" : compactCount(n));
  return `${part(tokensIn)}→${part(tokensOut)}`;
}
