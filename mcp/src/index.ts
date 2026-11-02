/**
 * Composition root (stdio). stdout carries ONLY JSON-RPC — every log goes to stderr.
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createHttpApi } from './adapters/http-api.js';
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

function main(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    console.error(`[devdigest-mcp] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const api = createHttpApi({ apiUrl: config.apiUrl });
  const handle = serveStdio(() => buildServer({ api, config }), {
    onerror: (err) => console.error('[devdigest-mcp] transport error:', err),
  });

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    handle.close().finally(() => process.exit(0));
  };
  process.stdin.on('end', shutdown);
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.error(`[devdigest-mcp] ready — API at ${config.apiUrl}`);
}

main();
