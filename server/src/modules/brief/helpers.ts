import { PrBriefRecord } from '@devdigest/shared';

/** Pure helpers for the brief module. No I/O. */

/** Stored JSON → record; `undefined` when it is corrupt or of an old shape (treated as no brief). */
export function toPrBriefRecord(json: unknown): PrBriefRecord | undefined {
  const parsed = PrBriefRecord.safeParse(json);
  return parsed.success ? parsed.data : undefined;
}
