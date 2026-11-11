import type { BlastRadius, Intent, Risk, ReviewFocusItem } from '@devdigest/shared';

/** Everything the brief prompt is made of, before any size limit is applied. */
export interface BriefInput {
  title: string;
  description: string | null;
  issue: { number: number; title: string; body: string | null } | null;
  intent: Intent | null;
  blast: BlastRadius;
  files: { path: string; additions: number; deletions: number }[];
  docs: { path: string; content: string }[];
}

/** Prompt sections as text, already within their limits. */
export interface BriefSections {
  title: string;
  description?: string;
  issue?: string;
  intent?: string;
  blast: string;
  stats: string;
  docs: { path: string; content: string }[];
}

/** Model output after grounding and clamping. */
export interface GroundedBrief {
  summary: string;
  risks: Risk[];
  reviewFocus: ReviewFocusItem[];
  droppedRisks: number;
  droppedFocus: number;
}
