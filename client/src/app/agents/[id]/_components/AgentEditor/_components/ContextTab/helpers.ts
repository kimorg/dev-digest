import type { ContextDocument, ContextPathEntry, SkillContextPaths } from "@devdigest/shared";

export interface ViaSkillsTotal {
  /** Distinct docs the agent gets only through its skills. */
  k: number;
  /** Their tokens (those that exist in the active repository), each counted once. */
  tokens: number;
}

/**
 * AC-30: K = distinct paths across all skills' lists that are not in the agent's own
 * list (a path under several skills counts once); T = tokens of those K that exist
 * in the active repository's document list.
 */
export function countViaSkills(
  agentPaths: ContextPathEntry[],
  skills: SkillContextPaths[],
  docsByPath: ReadonlyMap<string, Pick<ContextDocument, "tokens">>,
): ViaSkillsTotal {
  const own = new Set(agentPaths.map((p) => p.path));
  const via = new Set<string>();
  for (const skill of skills) {
    for (const { path } of skill.paths) if (!own.has(path)) via.add(path);
  }
  let tokens = 0;
  for (const path of via) tokens += docsByPath.get(path)?.tokens ?? 0;
  return { k: via.size, tokens };
}

/** Saved entries → ordered path list. */
export function toOrderedPaths(entries: ContextPathEntry[]): string[] {
  return [...entries].sort((a, b) => a.order - b.order).map((e) => e.path);
}
