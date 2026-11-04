import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { toToolResult } from '../errors.js';
import type { DevDigestService } from '../service.js';
import { agentArg, prArg, repoArg } from './args.js';

export function registerRunAgentOnPr(server: McpServer, service: DevDigestService): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        'Run one DevDigest reviewer agent on a PR and wait for the finished review (~1–2 min, spends LLM credits). Returns verdict, score, findings. If still running after ~110 s, returns run_id — then call get_findings.',
      inputSchema: z.object({ repo: repoArg, pr: prArg, agent: agentArg }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ repo, pr, agent }, ctx) =>
      toToolResult(() => service.runAgentOnPr(repo, pr, agent, ctx.mcpReq.signal)),
  );
}
