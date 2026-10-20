/* hooks/repos.ts — imported repositories (GET/POST /repos, refresh, delete). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Repo } from "../types";
import { queryKeys } from "./query-keys";

export function useRepos() {
  return useQuery({
    queryKey: queryKeys.repos(),
    queryFn: () => api.get<Repo[]>("/repos"),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.repos() }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<Repo>(`/repos/${repoId}/refresh`),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: queryKeys.repos() });
      qc.invalidateQueries({ queryKey: queryKeys.pulls(repoId) });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del<{ deleted: string }>(`/repos/${repoId}`),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: queryKeys.repos() });
      // The repo is gone — don't keep polling (or serving) its PR list.
      qc.removeQueries({ queryKey: queryKeys.pulls(repoId) });
    },
  });
}
