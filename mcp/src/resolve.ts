/** Application: turn what the model says (names, numbers) into API ids. */
import { MAX_HINT_ITEMS } from './constants.js';
import { ApiError, ToolError } from './errors.js';
import type { DevDigestApi } from './ports.js';
import type { ApiAgent, ApiPull, ApiRepo } from './types.js';

/** `owner/name` -> repo, matched case-insensitively on `full_name`. */
export async function resolveRepo(api: DevDigestApi, fullName: string): Promise<ApiRepo> {
  const repos = await api.listRepos();
  const wanted = fullName.toLowerCase();
  const found = repos.find((r) => r.full_name.toLowerCase() === wanted);
  if (found) return found;
  const known = repos.slice(0, MAX_HINT_ITEMS).map((r) => r.full_name);
  throw new ToolError(
    `Repo '${fullName}' is not added in DevDigest. ${
      known.length > 0 ? `Known: ${known.join(', ')}. ` : ''
    }Add it in the UI or use one of these.`,
  );
}

/** (repo, number) -> pull, without any GitHub sync; a 404 explains how to import the PR. */
export async function resolvePull(
  api: DevDigestApi,
  repo: ApiRepo,
  number: number,
): Promise<ApiPull> {
  try {
    return await api.getPullByNumber(repo.id, number);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new ToolError(
        `PR #${number} is not imported in DevDigest for ${repo.full_name}. Open the repo's Pull requests list in the DevDigest UI (it syncs from GitHub), then retry.`,
      );
    }
    throw err;
  }
}

/** Exact id first, then exact name (case-insensitive). No fuzzy match: a wrong paid agent must never start. */
export async function resolveAgent(api: DevDigestApi, ident: string): Promise<ApiAgent> {
  const agents = await api.listAgents();
  const byId = agents.find((a) => a.id === ident);
  if (byId) return byId;

  const wanted = ident.toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === wanted);
  if (byName.length === 1 && byName[0]) return byName[0];
  if (byName.length > 1) {
    throw new ToolError(
      `Agent name '${ident}' is ambiguous — use one of these ids: ${byName.map((a) => a.id).join(', ')}.`,
    );
  }
  const known = agents.slice(0, MAX_HINT_ITEMS).map((a) => a.name);
  throw new ToolError(
    `Agent '${ident}' not found — call list_agents (known: ${known.join(', ') || 'none'}).`,
  );
}
