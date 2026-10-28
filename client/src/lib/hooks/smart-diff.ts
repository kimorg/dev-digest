/* hooks/smart-diff.ts — PR files grouped by role (Files changed → Smart order).
   DB-only on the server: no model or GitHub call. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type { SmartDiffResponse } from "@devdigest/shared";

/** The PR's files grouped by role (always the 5 roles, in display order). */
export function usePrSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.prSmartDiff(prId),
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
