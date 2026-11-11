# mcp (`@devdigest/mcp`) — agent map

Local MCP server `devdigest-mcp` (stdio) for Claude Code: five tools that are a **thin client of the running
DevDigest HTTP API**. It never imports `server/`, never opens the DB. Overview and tools: [README](README.md).

## Stack

Node ≥ 22 · TypeScript · `@modelcontextprotocol/server` **2.4.0** (v2, stable; pinned exactly) · Zod 4 · tsx ·
Vitest · **npm** (has `package-lock.json`).

SDK decision (S2, checked with `npm view`): v2 `@modelcontextprotocol/server` is `latest` (2.4.0), so v2 is used
instead of v1 `@modelcontextprotocol/sdk` (1.32.2). Imports: `McpServer`, `InMemoryTransport` from
`@modelcontextprotocol/server`; `serveStdio` from `@modelcontextprotocol/server/stdio`. `inputSchema` is a
`z.object(...)`; invalid arguments come back as an `isError` result from the SDK. There is no client package: tests
speak raw JSON-RPC over `InMemoryTransport` (`test/mcp-client.ts`).

## Commands

```sh
npm install
npm start              # tsx src/index.ts (what .mcp.json runs; the API must be up on DEVDIGEST_API_URL)
npm run typecheck      # src + test (tsconfig.test.json)
npm test               # hermetic: API mocked, no Docker, no LLM, no live server
```

Manual testing (optional): MCP Inspector web UI via `../scripts/mcp-inspector.sh` — see [README](README.md#testing-with-mcp-inspector-recommended-optional).

## Where things live

- `src/types.ts` · `constants.ts` · `format.ts` — domain: wire schemas, limits, pure formatters
- `src/ports.ts` (`DevDigestApi`) · `resolve.ts` · `run-and-wait.ts` · `service.ts` — application
- `src/adapters/http-api.ts` — infrastructure: the only `fetch`
- `src/tools/*.ts` — presentation: one `register<X>` per tool, one service call each
- `src/server.ts` · `index.ts` · `config.ts` — composition (env is read only here)

## Conventions

- Handler = one service call + `toToolResult`. No logic in tools.
- Errors lead forward: throw `ToolError` with the next step in the text; `toToolResult` maps it to `isError`.
- Untrusted text (findings, conventions) goes through `clip()`; responses stay under the budget in `constants.ts`.
- Relative imports end in `.js`; files kebab-case; tests `test/<name>.test.ts`; Zod schema and type share one name.

## Gotchas

- **stdout carries only JSON-RPC.** Log with `console.error`. A stray `console.log` breaks the protocol.
- `.mcp.json` runs `npm --prefix mcp run --silent start`; without `--silent` npm banners would reach stdout.
- `run_agent_on_pr` waits up to 110 s (`DEVDIGEST_MCP_RUN_TIMEOUT_MS`) and then returns `status: "running"`.

## Do not touch

- stdout usage in `src/` (see above) and the `DevDigestApi` boundary: no imports from `../server`.
- `package-lock.json` — never hand-edit; changes only via `npm install|uninstall`, committed with `package.json`.
- Inspector fields in the root `.mcp.json` (they belong only to `inspector.json`). Inspector is not a dependency.

## Read before you work

- Past learnings → [INSIGHTS.md](INSIGHTS.md) · test strategy → [../TESTING.md](../TESTING.md)
- Feature spec for the task → [specs/](specs/README.md) (cross-package: [../specs/](../specs/README.md))
