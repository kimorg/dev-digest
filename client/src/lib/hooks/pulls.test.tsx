import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePrByNumber, usePulls } from "./pulls";

const PULLS = [{ id: "pr-uuid", number: 482, status: "needs_review", title: "Add rate limiting" }];
const DETAIL = { id: "pr-uuid", number: 482, title: "Add rate limiting" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderPrByNumber() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  // usePulls rides along so a test can wait for the rendered list state.
  const hook = () => ({ ...usePrByNumber("repo-1", "482"), list: usePulls("repo-1") });
  return { qc, ...renderHook(hook, { wrapper }) };
}

afterEach(() => vi.unstubAllGlobals());

describe("usePrByNumber — list errors", () => {
  it("keeps the PR on screen when a background list refetch fails", async () => {
    let listFails = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/repos/repo-1/pulls")
          ? listFails
            ? json({ error: { message: "boom" } }, 500)
            : json(PULLS)
          : json(DETAIL),
      ),
    );
    const { qc, result } = renderPrByNumber();
    await waitFor(() => expect(result.current.pr).toBeDefined());

    listFails = true;
    await act(() => qc.refetchQueries({ queryKey: ["pulls", "repo-1"] }));

    await waitFor(() => expect(result.current.list.isError).toBe(true));
    expect(result.current.list.data).toBeDefined();
    expect(result.current.isError).toBe(false);
    expect(result.current.pr).toMatchObject({ number: 482 });
  });

  it("reports an error when the list never loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "boom" } }, 500)));
    const { result } = renderPrByNumber();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 500 });
  });
});
