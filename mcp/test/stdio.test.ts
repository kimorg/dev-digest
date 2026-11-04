import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

describe('stdio entry point', () => {
  it('serves tools/list with only JSON-RPC on stdout and exits when stdin closes', async () => {
    const child = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['src/index.ts'], {
      cwd: ROOT,
      // Closed port: the API is never needed for tools/list.
      env: { ...process.env, DEVDIGEST_API_URL: 'http://127.0.0.1:1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines: string[] = [];
    const waiters = new Map<number, (m: Record<string, any>) => void>();
    createInterface({ input: child.stdout }).on('line', (line) => {
      lines.push(line);
      const msg = JSON.parse(line) as Record<string, any>;
      if (typeof msg.id === 'number') waiters.get(msg.id)?.(msg);
    });
    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));

    const send = (msg: object) => child.stdin.write(`${JSON.stringify(msg)}\n`);
    const call = (id: number, method: string, params?: object) =>
      new Promise<Record<string, any>>((resolve) => {
        waiters.set(id, resolve);
        send({ jsonrpc: '2.0', id, method, params });
      });

    const init = await call(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    expect(init.result.serverInfo.name).toBe('devdigest-mcp');
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const list = await call(2, 'tools/list');
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'list_agents',
      'run_agent_on_pr',
      'get_findings',
      'get_conventions',
      'get_blast_radius',
    ]);

    // A tool call against the closed port reports how to start the API.
    const unreachable = await call(3, 'tools/call', { name: 'list_agents', arguments: {} });
    expect(unreachable.result.isError).toBe(true);
    expect(unreachable.result.content[0].text).toContain('./scripts/dev.sh');

    for (const line of lines) expect(JSON.parse(line).jsonrpc).toBe('2.0');

    const closedAt = Date.now();
    child.stdin.end();
    await exited;
    expect(Date.now() - closedAt).toBeLessThanOrEqual(2000);
  }, 20_000);
});
