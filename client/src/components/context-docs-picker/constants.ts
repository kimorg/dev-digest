import type { ContextDocType } from "@devdigest/shared";

/** Colour of the type label in a row, by document type. */
export const TYPE_COLOR: Record<ContextDocType, string> = {
  docs: "var(--ok)",
  insights: "var(--warn)",
  specs: "var(--accent)",
  readme: "var(--text-muted)",
  plans: "var(--violet)",
};

/** Width of the inline preview panel, in px. */
export const PREVIEW_PANEL_WIDTH = 400;

/** Width of the filter input in the section header, in px. */
export const FILTER_WIDTH = 230;
