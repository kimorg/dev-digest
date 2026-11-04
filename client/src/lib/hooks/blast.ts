/* hooks/blast.ts — PR blast radius (Overview card). Read-only: the server
   reads the repo-intel index, no model or GitHub call. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type { BlastRadius } from "@devdigest/shared";

/** Changed symbols → callers → endpoints/crons, plus `degraded` / `reason`. */
export function usePrBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prBlast(prId),
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
