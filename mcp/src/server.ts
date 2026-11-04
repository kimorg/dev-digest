/** Composition: build the MCP server and register the tools in a fixed order. */
import { McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from './constants.js';
import type { DevDigestApi } from './ports.js';
import { DevDigestService, type ServiceOptions } from './service.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

export interface BuildServerOptions {
  api: DevDigestApi;
  config: Pick<Config, 'runTimeoutMs' | 'pollMs'>;
  /** Test seams for the run-and-wait loop. */
  sleep?: ServiceOptions['sleep'];
  now?: ServiceOptions['now'];
}

export function buildServer({ api, config, sleep, now }: BuildServerOptions): McpServer {
  const service = new DevDigestService({
    api,
    runTimeoutMs: config.runTimeoutMs,
    pollMs: config.pollMs,
    ...(sleep ? { sleep } : {}),
    ...(now ? { now } : {}),
  });
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  registerListAgents(server, service);
  registerRunAgentOnPr(server, service);
  registerGetFindings(server, service);
  registerGetConventions(server, service);
  registerGetBlastRadius(server, service);
  return server;
}
