import { z } from 'zod';

/** Rule kinds the model sorts candidates into. Only steers the model — not stored or shown. */
export const ConventionCategory = z.enum([
  'naming',
  'error-handling',
  'async',
  'typing',
  'imports',
  'structure',
  'testing',
  'formatting',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/**
 * What the `conventions` feature model must answer (`schemaName: 'ConventionExtraction'`):
 * a list of candidates `{ category, rule, evidence: file + line, confidence }`.
 * `evidence.code` is the model's quote of the cited lines; `verifyEvidence`
 * checks it against the real file before anything is stored. `category` is
 * dropped after verification.
 */
export const ConventionExtraction = z.object({
  candidates: z.array(
    z.object({
      category: ConventionCategory,
      rule: z.string(),
      evidence: z.object({
        file: z.string(),
        line_start: z.number().int(),
        line_end: z.number().int(),
        code: z.string(),
      }),
      confidence: z.number(),
    }),
  ),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;
export type ExtractedConvention = ConventionExtraction['candidates'][number];

/** A sample file shown to the model. */
export interface ConventionSample {
  path: string;
  text: string;
}
