import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { toToolResult } from '../errors.js';
import type { DevDigestService } from '../service.js';
import { repoArg } from './args.js';

export function registerGetConventions(server: McpServer, service: DevDigestService): void {
  server.registerTool(
    'get_conventions',
    {
      description:
        'Repo coding conventions (house rules) extracted by DevDigest, with evidence file:lines. Read-only; does not start a scan.',
      inputSchema: z.object({ repo: repoArg }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ repo }) => toToolResult(() => service.getConventions(repo)),
  );
}
