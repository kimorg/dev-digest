import { ApiError } from "@/lib/api";
import type { SkillImportDraft, SkillListItem, SkillType } from "@devdigest/shared";

/** The editable part of a skill, as held by the create / import / config forms. */
export interface SkillForm {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const EMPTY_SKILL_FORM: SkillForm = { name: "", description: "", type: "rubric", body: "" };

/** Seed a form from a saved skill or an import draft. */
export function toSkillForm(skill: SkillListItem | SkillImportDraft): SkillForm {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/** Every field is required (the server rejects blanks), so Save stays disabled until then. */
export function isSkillFormComplete(form: SkillForm): boolean {
  return (
    form.name.trim().length > 0 &&
    form.description.trim().length > 0 &&
    form.body.trim().length > 0
  );
}

/** Trim what the server trims, so "unchanged" and the saved values agree. */
export function toSkillPayload(form: SkillForm): SkillForm {
  return { ...form, name: form.name.trim(), description: form.description.trim() };
}

/** The server answers 409 when another skill already uses the name (any case). */
export function isNameTakenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
