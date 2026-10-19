/* skill-form.ts — helpers shared by every form that writes a skill: the Skills
   Lab (create / import / config) and Conventions' "Create skill" modal. */
import { ApiError } from "./api";

/** The server answers 409 when another skill already uses the name (any case). */
export function isNameTakenError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** Rough token estimate shown with a skill body (~4 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The file name a body is shown as: "PR Quality Rubric" → "pr-quality-rubric.md". */
export function toSkillFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "skill"}.md`;
}
