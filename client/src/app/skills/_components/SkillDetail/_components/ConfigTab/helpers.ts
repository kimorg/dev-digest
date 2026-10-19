import type { SkillListItem, UpdateSkillRequest } from "@devdigest/shared";
import { toSkillForm, toSkillPayload, type SkillForm } from "../../../SkillFields/helpers";

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
