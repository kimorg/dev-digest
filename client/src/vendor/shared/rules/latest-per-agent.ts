/**
 * "Latest review per agent" rule — the single copy shared by the server and the client.
 *
 * Input must be ordered newest-first. Keeps the first item per key; a null or
 * undefined key counts as one group (the empty-string key).
 */
export function pickLatestPerAgent<T>(
  newestFirst: readonly T[],
  groupKey: (item: T) => string | null | undefined,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of newestFirst) {
    const key = groupKey(item) ?? '';
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
