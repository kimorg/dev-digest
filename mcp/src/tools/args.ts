import { z } from 'zod';

/** Flat argument fields shared by the tools. Explicit character classes (no `\w`) keep the JSON Schema portable. */
export const repoArg = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .describe('GitHub owner/name, e.g. acme/payments-api');

export const prArg = z.number().int().positive();

export const agentArg = z.string().min(1).describe('agent id or exact name from list_agents');
