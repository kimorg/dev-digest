import { parseTimestamp } from "@/lib/format-date";
import { SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

/** Compact relative time for the list's UPDATED column (e.g. "3h", "2d"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export interface PullsFilter {
  /** Review status to keep, or "all". */
  status: string;
  /** Free-text search over title and number. */
  query: string;
  sort: "newest" | "oldest" | string;
}

/** The PR list's filter → search → sort pipeline (by last update). */
export function filterPulls(pulls: PrMeta[], { status, query, sort }: PullsFilter): PrMeta[] {
  const q = query.trim().toLowerCase();
  return pulls
    .filter((p) => status === "all" || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .sort((a, b) => {
      const ta = parseTimestamp(a.updated_at);
      const tb = parseTimestamp(b.updated_at);
      return sort === "oldest" ? ta - tb : tb - ta;
    });
}
