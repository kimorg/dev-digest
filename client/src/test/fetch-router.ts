import { vi } from "vitest";

export interface FakeResponse {
  status?: number;
  body?: unknown;
}

/** Answers one request; return `undefined` for a URL the test did not expect (→ 500, visible in the failure). */
export type FetchHandler = (
  url: string,
  init: RequestInit | undefined,
) => FakeResponse | undefined | Promise<FakeResponse | undefined>;

const stripOrigin = (input: unknown) => String(input).replace(/^https?:\/\/[^/]+/, "");

/** Stub `fetch`, routing every call by URL. Returns the spy so tests can inspect outbound calls. */
export function installFetch(handler: FetchHandler) {
  const spy = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = stripOrigin(input);
    const res = (await handler(url, init)) ?? {
      status: 500,
      body: { error: { code: "unexpected", message: "unrouted " + url } },
    };
    const status = res.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(res.body ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Every call made so far, as "METHOD /path?query". */
export function calledRequests(spy: ReturnType<typeof installFetch>): string[] {
  return spy.mock.calls.map(([input, init]) => {
    const method = (init as RequestInit | undefined)?.method ?? "GET";
    return method + " " + stripOrigin(input);
  });
}
