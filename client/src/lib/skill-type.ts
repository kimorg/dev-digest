/* skill-type.ts — how a skill's type is shown (Skills page + the agent's Skills
   tab). Labels are i18n'd under `skills.type.*`; this holds the colours. */
import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Text colour of a skill-type label (rubric accent blue, convention green, security red, custom amber). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent-text)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--warn)",
};

/** Background tint matching `SKILL_TYPE_COLOR`. */
export const SKILL_TYPE_BG: Record<SkillType, string> = {
  rubric: "var(--accent-bg)",
  convention: "var(--ok-bg)",
  security: "var(--crit-bg)",
  custom: "var(--warn-bg)",
};
