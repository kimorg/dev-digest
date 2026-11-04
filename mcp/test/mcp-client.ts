import { InMemoryTransport, type JSONRPCMessage, type McpServer } from '@modelcontextprotocol/server';

/** Minimal JSON-RPC client over the SDK's in-memory transport (no client package needed). */
export async function connectInMemory(server: McpServer) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (m: JSONRPCMessage) => void>();
  clientSide.onmessage = (m) => {
    const id = (m as { id?: number }).id;
    if (id !== undefined) pending.get(id)?.(m);
  };
  await server.connect(serverSide);
  await clientSide.start();

  let nextId = 1;
  const request = (method: string, params?: unknown) =>
    new Promise<{ result?: Record<string, any>; error?: { message: string } }>((resolve) => {
      const id = nextId++;
      pending.set(id, (m) => resolve(m as never));
      void clientSide.send({ jsonrpc: '2.0', id, method, params } as JSONRPCMessage);
    });

  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  await clientSide.send({ jsonrpc: '2.0', method: 'notifications/initialized' } as JSONRPCMessage);

  return {
    instructions: init.result?.instructions as string | undefined,
    listTools: async () => (await request('tools/list')).result?.tools as Record<string, any>[],
    toolsListBytes: async () => Buffer.byteLength(JSON.stringify((await request('tools/list')).result?.tools)),
    callTool: async (name: string, args: Record<string, unknown> = {}) => {
      const res = await request('tools/call', { name, arguments: args });
      if (res.error) return { isError: true, text: res.error.message, protocolError: true };
      const result = res.result as { isError?: boolean; content: { text: string }[] };
      return { isError: result.isError === true, text: result.content[0]?.text ?? '', protocolError: false };
    },
    close: () => clientSide.close(),
  };
}
