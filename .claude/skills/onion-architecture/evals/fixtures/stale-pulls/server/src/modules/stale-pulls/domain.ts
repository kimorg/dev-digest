const DAY_MS = 24 * 60 * 60 * 1000;

export function staleCutoff(now: number, staleAfterDays: number): Date {
  return new Date(now - staleAfterDays * DAY_MS);
}

export function sortByOldest(pulls: { updatedAt: string }[]): void {
  pulls.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}
