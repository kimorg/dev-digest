/* hooks/intent.ts — PR intent (Overview card). Reading never triggers a model
   call; detection runs when a review starts or the user clicks Recalculate. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type { PrIntentResult, PrIntentView } from "@devdigest/shared";

/** The stored intent + `stale` (PR or model changed since detection). Read-only. */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prIntent(prId),
    queryFn: () => api.get<PrIntentView>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Refresh the PR from GitHub (title/body/head sha), then re-detect if anything
   changed. `regenerated: false` means nothing changed since the last detection.
   Errors surface through the global mutation toast. */
export function useRecalculatePrIntent(prId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Best-effort sync: a failed refetch keeps the cached data and the server
      // then judges freshness from what it has.
      await Promise.all([
        qc.refetchQueries({ queryKey: queryKeys.pulls(repoId) }),
        qc.refetchQueries({ queryKey: queryKeys.pull(prId) }),
      ]);
      return api.post<PrIntentResult>(`/pulls/${prId}/intent/recalculate`);
    },
    onSuccess: (result) => {
      qc.setQueryData<PrIntentView>(queryKeys.prIntent(prId), {
        intent: result.intent,
        stale: false,
      });
    },
  });
}
