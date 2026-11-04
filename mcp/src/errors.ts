/**
 * Errors with forward-leading text, and the one mapping from a failure to an
 * MCP `isError` tool result. Protocol-level errors stay for structural problems
 * (the SDK reports invalid arguments itself).
 */

/** A domain failure whose message already tells the model what to do next. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** The API answered with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly request: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API could not be reached (connection refused, timeout, DNS…). */
export class ApiUnreachableError extends Error {
  constructor(readonly apiUrl: string) {
    super(
      `DevDigest API is not reachable at ${apiUrl}. Start it: \`./scripts/dev.sh\` (or \`cd server && pnpm dev\`), then retry.`,
    );
    this.name = 'ApiUnreachableError';
  }
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: true;
}

const text = (value: string): ToolResult['content'] => [{ type: 'text', text: value }];

/** Text of an `isError` result for any thrown value. */
export function describeError(err: unknown): string {
  if (err instanceof ToolError || err instanceof ApiUnreachableError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Rate-limited (reviews: 10/min). Wait a minute and retry.';
    if (err.status >= 500) {
      return `DevDigest API error ${err.status}: ${err.message}. Check the server terminal.`;
    }
    return `DevDigest API rejected ${err.request} (${err.status} ${err.code}): ${err.message}`;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error('[devdigest-mcp] unexpected error:', err);
  return `Unexpected devdigest-mcp error: ${message}`;
}

/** Run one tool body: a JSON-serialisable value becomes compact text, a failure becomes `isError`. */
export async function toToolResult(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: text(JSON.stringify(await fn())) };
  } catch (err) {
    return { content: text(describeError(err)), isError: true };
  }
}
