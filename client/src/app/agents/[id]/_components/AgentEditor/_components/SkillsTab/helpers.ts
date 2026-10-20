import type { AgentSkillLink, SkillListItem } from "@devdigest/shared";

export interface AgentSkillRows {
  /** Skills linked to the agent, in prompt order. */
  linked: SkillListItem[];
  /** Every other skill of the workspace, newest first (by creation date). */
  unlinked: SkillListItem[];
}

/** Split all skills into the agent's linked ones (link order) and the rest (newest first, ties A→Z). */
export function toAgentSkillRows(skills: SkillListItem[], links: AgentSkillLink[]): AgentSkillRows {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => byId.get(l.skill_id))
    .filter((sk): sk is SkillListItem => sk !== undefined);
  const linkedIds = new Set(linked.map((sk) => sk.id));
  const unlinked = skills
    .filter((sk) => !linkedIds.has(sk.id))
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  return { linked, unlinked };
}

/** Case-insensitive name filter; blank query → everything. */
export function matchesName(skill: SkillListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || skill.name.toLowerCase().includes(q);
}

/** Attach (append at the end) or detach a skill; returns the new ordered id list. */
export function toggleLink(linkedIds: string[], skillId: string, isOn: boolean): string[] {
  const without = linkedIds.filter((id) => id !== skillId);
  return isOn ? [...without, skillId] : without;
}

/** Move `activeId` to the position of `overId`; unknown ids → unchanged. */
export function moveLink(linkedIds: string[], activeId: string, overId: string): string[] {
  const from = linkedIds.indexOf(activeId);
  const to = linkedIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return linkedIds;
  const next = [...linkedIds];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
