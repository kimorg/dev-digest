/* hooks/context.ts — Project Context Folder (A3 contract; safe to call once the
   API exposes it). Not wired to a screen yet: the Project Context lesson adds the UI. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { SpecFile, IndexStatus } from "../types";
import { queryKeys } from "./query-keys";

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.contextFiles(repoId),
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<IndexStatus>(`/repos/${repoId}/context/reindex`),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: queryKeys.contextFiles(repoId) }),
  });
}
