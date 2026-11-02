import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ToolError, toToolResult } from '../errors.js';
import { prArg, repoArg } from './args.js';

/** Stub: Blast Radius is not built yet. Never calls the API. */
export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: 'NOT IMPLEMENTED YET — will return the PR impact map. Currently always returns an error.',
      inputSchema: z.object({ repo: repoArg, pr: prArg }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    () =>
      toToolResult(async () => {
        throw new ToolError(
          'get_blast_radius is not implemented yet (planned: Blast Radius, L04). For review results call get_findings(repo, pr, agent).',
        );
      }),
  );
}
