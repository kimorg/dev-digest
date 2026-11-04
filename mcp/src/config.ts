import { z } from 'zod';
import {
  DEFAULT_API_URL,
  DEFAULT_POLL_MS,
  DEFAULT_RUN_TIMEOUT_MS,
  MIN_POLL_MS,
} from './constants.js';

const Env = z.object({
  DEVDIGEST_API_URL: z.string().url().default(DEFAULT_API_URL),
  DEVDIGEST_MCP_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_RUN_TIMEOUT_MS),
  DEVDIGEST_MCP_POLL_MS: z.coerce.number().int().min(MIN_POLL_MS).default(DEFAULT_POLL_MS),
});

export interface Config {
  /** API base URL without a trailing slash. */
  apiUrl: string;
  runTimeoutMs: number;
  pollMs: number;
}

/** Parse the environment once, at startup. Empty values count as unset. */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const pick = (key: keyof z.input<typeof Env>) => (env[key] ? env[key] : undefined);
  const parsed = Env.safeParse({
    DEVDIGEST_API_URL: pick('DEVDIGEST_API_URL'),
    DEVDIGEST_MCP_RUN_TIMEOUT_MS: pick('DEVDIGEST_MCP_RUN_TIMEOUT_MS'),
    DEVDIGEST_MCP_POLL_MS: pick('DEVDIGEST_MCP_POLL_MS'),
  });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid devdigest-mcp environment — ${detail}`);
  }
  return {
    apiUrl: parsed.data.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    runTimeoutMs: parsed.data.DEVDIGEST_MCP_RUN_TIMEOUT_MS,
    pollMs: parsed.data.DEVDIGEST_MCP_POLL_MS,
  };
}
