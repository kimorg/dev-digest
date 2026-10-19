import type { ConventionSkillDraft, CreateSkillRequest, SkillType } from "@devdigest/shared";

/** The modal's editable fields (the draft from the server, then the user's edits). */
export interface ConventionSkillForm {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
}

export function toConventionSkillForm(draft: ConventionSkillDraft): ConventionSkillForm {
  return { name: draft.name, description: draft.description, type: draft.type, enabled: true, body: draft.body };
}

/** Name, description and body are required by POST /skills. */
export function isConventionSkillFormComplete(form: ConventionSkillForm): boolean {
  return form.name.trim() !== "" && form.description.trim() !== "" && form.body.trim() !== "";
}

/** POST /skills body: an `extracted` skill that remembers the files its rules came from. */
export function toCreateSkillRequest(form: ConventionSkillForm, evidenceFiles: string[]): CreateSkillRequest {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    type: form.type,
    body: form.body,
    source: "extracted",
    enabled: form.enabled,
    evidence_files: evidenceFiles,
  };
}
