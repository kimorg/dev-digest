/* hooks/brief.ts — PR brief (Overview). Reading never triggers a model call;
   generation runs only when the user clicks Generate / Refresh. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type { PrBriefView } from "@devdigest/shared";

/** The stored brief + `stale` (PR head moved since generation). Read-only. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prBrief(prId),
    queryFn: () => api.get<PrBriefView>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate (or regenerate) the brief — one model call. The error is shown inline
   by the banner, so the global mutation toast is skipped (`meta.silent`). */
export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefView>(`/pulls/${prId}/brief`),
    meta: { silent: true },
    onSuccess: (view) => {
      qc.setQueryData<PrBriefView>(queryKeys.prBrief(prId), view);
    },
  });
}
