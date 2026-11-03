import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { toToolResult } from '../errors.js';
import type { DevDigestService } from '../service.js';
import { prArg, repoArg } from './args.js';

export function registerGetBlastRadius(server: McpServer, service: DevDigestService): void {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        'Impact map of a PR from the DevDigest repo index: changed symbols, their callers (file:line), HTTP endpoints and crons that may be affected. Read-only, no LLM. Call before judging a change to shared code.',
      inputSchema: z.object({ repo: repoArg, pr: prArg }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    ({ repo, pr }) => toToolResult(() => service.getBlastRadius(repo, pr)),
  );
}
