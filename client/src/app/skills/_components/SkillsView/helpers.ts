import type { SkillListItem } from "@devdigest/shared";

/** Case-insensitive match on name or description; blank query → everything. */
export function filterSkills(skills: SkillListItem[], query: string): SkillListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q));
}
