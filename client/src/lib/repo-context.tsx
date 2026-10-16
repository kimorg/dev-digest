/* repo-context.tsx — tracks the active repo for the shell + :repoId routing.
   Priority: repoId in the URL path > localStorage > first repo from the API. */
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useRepos } from "./hooks/repos";
import type { Repo } from "./types";

/** localStorage key for the last-selected repo. */
const STORAGE_KEY = "dd-repo";

/** Stable empty list while repos load (keeps consumers' memo deps steady). */
const NO_REPOS: Repo[] = [];

/* The context holds only the user's stored choice — repos come from the query
   cache and the URL from the router, so they're read where needed instead of
   being copied into context (which re-rendered every consumer on each change). */
const RepoCtx = React.createContext<{
  storedRepoId: string | null;
  setRepoId: (id: string) => void;
}>({ storedRepoId: null, setRepoId: () => {} });

function repoIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/repos\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const [storedRepoId, setStored] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setStored(localStorage.getItem(STORAGE_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  const setRepoId = React.useCallback((id: string) => {
    setStored(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = React.useMemo(() => ({ storedRepoId, setRepoId }), [storedRepoId, setRepoId]);
  return <RepoCtx.Provider value={value}>{children}</RepoCtx.Provider>;
}

/** The active repo. Priority: repoId in the URL path > stored choice > first repo. */
export function useActiveRepo(): {
  repoId: string | null;
  setRepoId: (id: string) => void;
  repos: Repo[];
  activeRepo: Repo | null;
  reposLoaded: boolean;
} {
  const { storedRepoId, setRepoId } = React.useContext(RepoCtx);
  const pathname = usePathname();
  const { data, isSuccess: reposLoaded } = useRepos();
  const repos = data ?? NO_REPOS;
  const repoId = repoIdFromPath(pathname) ?? storedRepoId ?? repos[0]?.id ?? null;
  const activeRepo = repos.find((r) => r.id === repoId) ?? null;
  return { repoId, setRepoId, repos, activeRepo, reposLoaded };
}

/**
 * True once the repos list has loaded and the given :repoId matches none of
 * them — i.e. a stale/invalid repo in the URL ("no repo selected"). Repo-scoped
 * pages use this to show a friendly empty state instead of a "Repo not found"
 * error. Returns false while repos are still loading (avoids a flash) and on a
 * repos fetch failure (let the page surface its real error in that case).
 */
export function useRepoNotFound(repoId: string | null | undefined): boolean {
  const { repos, reposLoaded } = useActiveRepo();
  return reposLoaded && repoId != null && !repos.some((r) => r.id === repoId);
}
