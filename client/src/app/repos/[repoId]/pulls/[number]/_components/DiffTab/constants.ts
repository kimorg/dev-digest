import type { Severity, SmartDiffRole } from "@devdigest/shared";

/** Groups with this role start collapsed regardless of size. */
export const COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);

/** Colour (CSS token) and i18n keys (under `prReview.smartDiff`) of each role group. */
export const ROLE_META: Record<
  SmartDiffRole,
  { color: string; labelKey: `${SmartDiffRole}Label`; hintKey: `${SmartDiffRole}Hint` }
> = {
  core: { color: "var(--accent)", labelKey: "coreLabel", hintKey: "coreHint" },
  tests: { color: "var(--violet)", labelKey: "testsLabel", hintKey: "testsHint" },
  wiring: { color: "var(--warn)", labelKey: "wiringLabel", hintKey: "wiringHint" },
  docs: { color: "var(--ok)", labelKey: "docsLabel", hintKey: "docsHint" },
  boilerplate: { color: "var(--info)", labelKey: "boilerplateLabel", hintKey: "boilerplateHint" },
};

/** Text on the bar of an annotated line, per severity (i18n key under `smartDiff.lineLabel`). */
export const LINE_LABEL: Record<Severity, "blocker" | "warning" | "suggestion"> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

export type DiffOrder = "smart" | "original";

/** `default`: findings visible, GitHub comments hidden. `shown`: both. `hidden`: neither. */
export type CommentsMode = "default" | "shown" | "hidden";
