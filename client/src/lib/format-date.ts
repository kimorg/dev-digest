/* format-date.ts — timestamp parsing + display formatting shared across screens.
   Display uses the browser locale (as before); unknown/invalid input never throws. */

/** Epoch ms for sorting; missing or unparseable timestamps become 0 (sort last). */
export function parseTimestamp(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

/** Local date + time ("10/1/2026, 12:00:00 PM"); the raw string when unparseable. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Local time of day ("12:00:00 PM"); the raw string when unparseable. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}
