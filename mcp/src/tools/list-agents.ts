import type { McpServer } from '@modelcontextprotocol/server';
import { toToolResult } from '../errors.js';
import type { DevDigestService } from '../service.js';

export function registerListAgents(server: McpServer, service: DevDigestService): void {
  server.registerTool(
    'list_agents',
    {
      description:
        'List DevDigest reviewer agents (id, name, enabled, model). Call first to get a valid `agent` for run_agent_on_pr / get_findings.',
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    () => toToolResult(() => service.listAgents()),
  );
}
