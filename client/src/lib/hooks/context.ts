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

/**
 * Optimistic write of one attachment list into `key`; `onError` only rolls back (the global toast reports it).
 * Every save sends the full list, so quick toggles overlap: `scope` sends them one at a time, in order, and
 * only the newest save writes its result or rolls back — an older one would put a stale list in the cache.
 */
function useSetContextPaths<T extends { paths: ContextPathsResult["paths"] }>(
  key: QueryKey,
  url: string,
  onSettled: (qc: QueryClient) => void,
) {
  const qc = useQueryClient();
  // The running save counts itself until its callbacks finish.
  const isNewest = () => qc.isMutating({ mutationKey: key, exact: true }) === 1;
  const withPaths = (paths: ContextPathsResult["paths"]) => (old: T | undefined) => (old ? { ...old, paths } : old);
  return useMutation({
    mutationKey: key,
    scope: { id: JSON.stringify(key) },
    mutationFn: (paths: string[]) => api.put<ContextPathsResult>(url, { paths } satisfies SetContextPathsRequest),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<T>(key);
      qc.setQueryData<T>(key, withPaths(toEntries(paths)));
      return { previous };
    },
    onError: (_e, _paths, ctx) => {
      if (!isNewest()) return;
      qc.setQueryData(key, ctx?.previous);
      // `previous` may hold an earlier save that failed too — re-read the stored list.
      void qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: (result) => {
      if (isNewest()) qc.setQueryData<T>(key, withPaths(result.paths));
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
