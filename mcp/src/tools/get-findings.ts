import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { toToolResult } from '../errors.js';
import type { DevDigestService } from '../service.js';
import { agentArg, prArg, repoArg } from './args.js';

export function registerGetFindings(server: McpServer, service: DevDigestService): void {
  server.registerTool(
    'get_findings',
    {
      description:
        'Latest finished review of one agent on a PR: verdict, score, summary, findings. Read-only, no LLM cost. Use it for existing results or after run_agent_on_pr returned status "running".',
      inputSchema: z.object({ repo: repoArg, pr: prArg, agent: agentArg }),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ repo, pr, agent }) => toToolResult(() => service.getFindings(repo, pr, agent)),
  );
}
