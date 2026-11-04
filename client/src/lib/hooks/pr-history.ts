/* hooks/pr-history.ts — prior merged PRs that touched the same files (Overview, under the blast radius).
   The server asks GitHub and caches per head sha, so the client holds the answer for 10 minutes too. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type { PrHistory } from "@devdigest/shared";

const HISTORY_STALE_MS = 10 * 60_000;

export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prHistory(prId),
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
    staleTime: HISTORY_STALE_MS,
  });
}
