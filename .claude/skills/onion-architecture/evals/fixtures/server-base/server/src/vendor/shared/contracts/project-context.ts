import { z } from 'zod';

/**
 * Project Context — repo markdown docs that can be attached to agents / skills
 * and injected (as untrusted data) into the review prompt.
 */

export const ContextDocType = z.enum(['docs', 'specs', 'insights', 'plans', 'readme']);
export type ContextDocType = z.infer<typeof ContextDocType>;

export const ContextDocument = z.object({
  path: z.string(),
  name: z.string(),
  dir: z.string(),
  type: ContextDocType,
  size_bytes: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  too_large: z.boolean(),
  used_by: z.object({
    agents: z.number().int().nonnegative(),
    skills: z.number().int().nonnegative(),
  }),
});
export type ContextDocument = z.infer<typeof ContextDocument>;

export const ContextListResult = z.object({
  status: z.enum(['ok', 'no_clone']),
  scanned_at: z.string().nullable(),
  truncated: z.boolean(),
  total_tokens: z.number().int().nonnegative(),
  documents: z.array(ContextDocument),
});
export type ContextListResult = z.infer<typeof ContextListResult>;

export const ContextFileQuery = z.object({ path: z.string() });
export type ContextFileQuery = z.infer<typeof ContextFileQuery>;

export const ContextFileResult = z.object({
  path: z.string(),
  type: ContextDocType,
  size_bytes: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  content: z.string(),
});
export type ContextFileResult = z.infer<typeof ContextFileResult>;

/** Limits (count, length, duplicates) are checked in the service, each with its own error code. */
export const SetContextPathsRequest = z.object({ paths: z.array(z.string()) });
export type SetContextPathsRequest = z.infer<typeof SetContextPathsRequest>;

export const ContextPathEntry = z.object({
  path: z.string(),
  order: z.number().int().nonnegative(),
});
export type ContextPathEntry = z.infer<typeof ContextPathEntry>;

export const ContextPathsResult = z.object({ paths: z.array(ContextPathEntry) });
export type ContextPathsResult = z.infer<typeof ContextPathsResult>;

export const SkillContextPaths = z.object({
  skill_id: z.string(),
  paths: z.array(ContextPathEntry),
});
export type SkillContextPaths = z.infer<typeof SkillContextPaths>;

/** `skills` is present only for `?include=skills` (absent, never null). */
export const AgentContextResult = ContextPathsResult.extend({
  skills: z.array(SkillContextPaths).optional(),
});
export type AgentContextResult = z.infer<typeof AgentContextResult>;

export const AgentContextQuery = z.object({ include: z.enum(['skills']).optional() });
export type AgentContextQuery = z.infer<typeof AgentContextQuery>;
