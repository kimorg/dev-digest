/* hooks/pulls.ts — pull requests (GET /repos/:id/pulls, GET /pulls/:id). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrMeta, PrDetail } from "../types";
import { countNeedsReview } from "../pr-status";
import { queryKeys } from "./query-keys";

export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.pulls(repoId),
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    // Auto-refresh PR statuses: re-sync from GitHub every 60s while the page is
    // open, and whenever the window regains focus.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Sidebar badge count of PRs needing review. Reads the same cache as usePulls
    but doesn't poll on its own — the PR list keeps it fresh while it's open. */
export function useNeedsReviewCount(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.pulls(repoId),
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    select: countNeedsReview,
  });
}

export function usePull(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.pull(prId),
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}

/** A PR by its number in a repo. Routes use the PR number, but every PR API is
    keyed by the row's uuid — resolve number → uuid via the (cached) pulls list,
    then load the detail. */
export function usePrByNumber(repoId: string | null | undefined, number: number | string) {
  const pulls = usePulls(repoId);
  const prId = pulls.data?.find((p) => p.number === Number(number))?.id ?? null;
  const detail = usePull(prId);
  // The list polls in the background; a failed poll keeps its cached data, which
  // still resolves the id — so it only blocks the screen when there is no list.
  const listFailed = pulls.isError && pulls.data == null;
  return {
    prId,
    pr: detail.data,
    /** The pulls list loaded and has no PR with this number. */
    isUnknownNumber: pulls.data != null && prId == null,
    isLoading: pulls.isLoading || (prId != null && detail.isLoading),
    isError: listFailed || detail.isError,
    error: detail.error ?? (listFailed ? pulls.error : null),
    /** Retry whatever failed: the list when it never loaded, else the detail. */
    refetch: () => (listFailed ? pulls.refetch() : detail.refetch()),
  };
}
