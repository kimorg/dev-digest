/* routes.ts — the app's screen URLs, built in one place. (API paths live in the
   hooks; this is only for navigation and links.) */

type Search = URLSearchParams | Record<string, string>;

/** Append a query string when there is one. */
function withSearch(path: string, search?: Search): string {
  const qs = search ? new URLSearchParams(search).toString() : "";
  return qs ? `${path}?${qs}` : path;
}

export const routes = {
  home: () => "/",
  onboarding: () => "/onboarding",
  pulls: (repoId: string, search?: Search) => withSearch(`/repos/${repoId}/pulls`, search),
  pull: (repoId: string, number: number | string, search?: Search) =>
    withSearch(`/repos/${repoId}/pulls/${number}`, search),
  agents: () => "/agents",
  agent: (id: string, search?: Search) => withSearch(`/agents/${id}`, search),
  settings: (section = "api-keys") => `/settings/${section}`,
};
