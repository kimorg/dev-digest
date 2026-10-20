/* hooks/conventions.ts — React Query hooks for the Conventions page (L02):
   the repo's latest scan + candidates, running a scan, accept / reject / edit,
   and the accepted candidates as a skill draft. Spec: client/specs/004-conventions.md. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type {
  ConventionCandidate,
  ConventionSkillDraft,
  RepoConventions,
  SetConventionsStatusRequest,
  UpdateConventionRequest,
} from "@devdigest/shared";

export function useRepoConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.repoConventions(repoId),
    queryFn: () => api.get<RepoConventions>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** After a write that returns the repo's snapshot: store it, drop the stale draft. */
function useSnapshotWritten(repoId: string) {
  const qc = useQueryClient();
  return (snapshot: RepoConventions) => {
    qc.setQueryData(queryKeys.repoConventions(repoId), snapshot);
    qc.removeQueries({ queryKey: queryKeys.conventionSkillDraft(repoId) });
  };
}

/** Run a scan. The request waits for the model (tens of seconds) and returns the new snapshot. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  const written = useSnapshotWritten(repoId);
  return useMutation({
    mutationFn: () => api.post<RepoConventions>(`/repos/${repoId}/conventions/extract`),
    onSuccess: written,
    // A failed scan is recorded server-side (the global handler toasts the error): refetch to show it.
    onError: () => qc.invalidateQueries({ queryKey: queryKeys.repoConventions(repoId) }),
  });
}

export interface UpdateConventionInput {
  id: string;
  patch: UpdateConventionRequest;
}

/** Accept / reject / edit one candidate. A rejected one leaves the list. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<RepoConventions>(queryKeys.repoConventions(repoId), (prev) =>
        prev
          ? {
              ...prev,
              candidates:
                updated.status === "rejected"
                  ? prev.candidates.filter((c) => c.id !== updated.id)
                  : prev.candidates.map((c) => (c.id === updated.id ? updated : c)),
            }
          : prev,
      );
      qc.removeQueries({ queryKey: queryKeys.conventionSkillDraft(repoId) });
    },
  });
}

/** Accept all / Deselect all. */
export function useSetConventionsStatus(repoId: string) {
  const written = useSnapshotWritten(repoId);
  return useMutation({
    mutationFn: (input: SetConventionsStatusRequest) =>
      api.post<RepoConventions>(`/repos/${repoId}/conventions/set-status`, input),
    onSuccess: written,
  });
}

/** The accepted candidates merged into one skill draft (nothing is saved). */
export function useConventionSkillDraft(repoId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.conventionSkillDraft(repoId),
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled,
    staleTime: Infinity,
  });
}
