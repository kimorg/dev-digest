/* hooks/context.ts — React Query hooks for Project Context (SPEC-005): the repo's
   markdown docs, rescan, one file, and the agent / skill attachments. */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "./query-keys";
import type {
  AgentContextResult,
  ContextFileResult,
  ContextListResult,
  ContextPathsResult,
  SetContextPathsRequest,
} from "@devdigest/shared";

export function useContextDocuments(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.contextFiles(repoId ?? null),
    queryFn: () => api.get<ContextListResult>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useRescanContext(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ContextListResult>(`/repos/${repoId}/context/rescan`),
    onSuccess: (list) => {
      qc.setQueryData(queryKeys.contextFiles(repoId ?? null), list);
      qc.invalidateQueries({ queryKey: queryKeys.contextFile(repoId ?? null) });
    },
  });
}

export function useContextFile(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.contextFile(repoId ?? null, path ?? null),
    queryFn: () =>
      api.get<ContextFileResult>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
    retry: false,
  });
}

/** The agent's own attachments plus, for the via-skills line, each enabled linked skill's list. One request. */
export function useAgentContextWithSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentContext(agentId ?? null),
    queryFn: () => api.get<AgentContextResult>(`/agents/${agentId}/context?include=skills`),
    enabled: !!agentId,
  });
}

export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillContext(skillId ?? null),
    queryFn: () => api.get<ContextPathsResult>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/** Ordered path list → the `{path, order}` entries the API returns. */
function toEntries(paths: string[]) {
  return paths.map((path, order) => ({ path, order }));
}

/** Docs' `used_by` counts move with attachments. */
function refreshDocumentCounts(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.contextFiles() });
}

/** Optimistic write of one attachment list into `key`; `onError` only rolls back (the global toast reports it). */
function useSetContextPaths<T extends { paths: ContextPathsResult["paths"] }>(
  key: QueryKey,
  url: string,
  onSettled: (qc: QueryClient) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.put<ContextPathsResult>(url, { paths } satisfies SetContextPathsRequest),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<T>(key);
      qc.setQueryData<T>(key, { ...(previous ?? {}), paths: toEntries(paths) } as T);
      return { previous };
    },
    onError: (_e, _paths, ctx) => qc.setQueryData(key, ctx?.previous),
    onSuccess: (result) => {
      const current = qc.getQueryData<T>(key);
      qc.setQueryData<T>(key, { ...(current ?? {}), paths: result.paths } as T);
    },
    onSettled: () => onSettled(qc),
  });
}

export function useSetAgentContext(agentId: string) {
  return useSetContextPaths<AgentContextResult>(
    queryKeys.agentContext(agentId),
    `/agents/${agentId}/context`,
    refreshDocumentCounts,
  );
}

export function useSetSkillContext(skillId: string) {
  return useSetContextPaths<ContextPathsResult>(queryKeys.skillContext(skillId), `/skills/${skillId}/context`, (qc) => {
    // A skill's list feeds every agent's via-skills line.
    qc.invalidateQueries({ queryKey: queryKeys.agentContext() });
    refreshDocumentCounts(qc);
  });
}
