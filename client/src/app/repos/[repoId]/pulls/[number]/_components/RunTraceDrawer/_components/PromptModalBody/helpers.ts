/** A slice of a line, flagged when it matches the search query. */
export interface LineSegment {
  text: string;
  match: boolean;
}

/** Split `line` around every case-insensitive occurrence of `q` (whole line, no
    match, when `q` is empty). */
export function splitMatches(line: string, q: string): LineSegment[] {
  if (!q) return [{ text: line, match: false }];
  const lower = line.toLowerCase();
  const ql = q.toLowerCase();
  const out: LineSegment[] = [];
  let i = 0;
  for (let idx = lower.indexOf(ql); idx !== -1; idx = lower.indexOf(ql, i)) {
    if (idx > i) out.push({ text: line.slice(i, idx), match: false });
    out.push({ text: line.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  if (i < line.length) out.push({ text: line.slice(i), match: false });
  return out;
}
