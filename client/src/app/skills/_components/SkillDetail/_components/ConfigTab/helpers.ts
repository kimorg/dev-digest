import type { SkillListItem, UpdateSkillRequest } from "@devdigest/shared";
import { toSkillForm, toSkillPayload, type SkillForm } from "../../../SkillFields/helpers";

/** Rough token estimate shown under the body (~4 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The file name the body is shown as: "PR Quality Rubric" → "pr-quality-rubric.md". */
export function toSkillFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "skill"}.md`;
}

/** Only the fields that differ from the saved skill — what PUT /skills/:id should get. */
export function changedFields(form: SkillForm, skill: SkillListItem): Partial<UpdateSkillRequest> {
  const next = toSkillPayload(form);
  const saved = toSkillForm(skill);
  const patch: Partial<SkillForm> = {};
  for (const key of ["name", "description", "type", "body"] as const) {
    if (next[key] !== saved[key]) (patch as Record<string, string>)[key] = next[key];
  }
  return patch;
}
