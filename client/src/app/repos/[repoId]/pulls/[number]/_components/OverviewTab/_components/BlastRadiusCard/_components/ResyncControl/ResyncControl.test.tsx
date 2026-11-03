import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import blast from "../../../../../../../../../../../../messages/en/blast.json";

const timeout = vi.hoisted(() => ({ ms: 120_000 }));
vi.mock("../../constants", () => ({
  get RESYNC_POLL_TIMEOUT_MS() {
    return timeout.ms;
  },
}));

import { ResyncControl } from "./ResyncControl";

const OLD = { status: "partial", filesIndexed: 1, filesSkipped: 0, lastIndexedSha: "aaa", updatedAt: "t1" };
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const NEW = { ...OLD, status: "full", lastIndexedSha: "bbb", updatedAt: "t2" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function setup(opts: { post: unknown; states: unknown[] }) {
  let stateCalls = 0;
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith("/resync")) return json(opts.post, 202);
    if (url.endsWith("/index-state")) return json(opts.states[Math.min(stateCalls++, opts.states.length - 1)]);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast }}>
        <ResyncControl prId="p1" repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  const calls = (suffix: string) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(suffix));
  return { calls, invalidate };
}

beforeEach(() => {
  timeout.ms = 120_000;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResyncControl — resync flow", () => {
  it("POSTs the resync, polls the index state, then refreshes the blast map", async () => {
    // initial load, refetch after the POST (unchanged), then the poll sees the new index
    const { calls, invalidate } = setup({ post: { status: "accepted", jobId: "j1" }, states: [OLD, OLD, NEW] });
    await vi.waitFor(() => expect(calls("/index-state").length).toBe(1));
    await screen.findByRole("button", { name: "Resync index" });
    await sleep(20); // let the first state land in the cache

    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(await screen.findByText("Re-indexing…")).toBeInTheDocument();
    expect(calls("/resync")).toHaveLength(1);
    expect((calls("/resync")[0]![1] as RequestInit).method).toBe("POST");

    expect(await screen.findByText("Index updated — the map is refreshed.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-blast", "p1"] });
  }, 10_000);

  it("a not-enqueued answer shows the failure and does not poll", async () => {
    const { calls } = setup({
      post: { status: "accepted", degraded: true, reason: "no_handler" },
      states: [OLD],
    });
    await vi.waitFor(() => expect(calls("/index-state").length).toBe(1));
    await sleep(20);
    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(await screen.findByText(/Couldn't start the resync/)).toBeInTheDocument();
    const after = calls("/index-state").length;
    await sleep(1800);
    expect(calls("/index-state").length).toBe(after); // no polling
  }, 10_000);

  it("stops with 'still indexing' when the index never advances", async () => {
    timeout.ms = 100;
    const { calls } = setup({ post: { status: "accepted", jobId: "j1" }, states: [OLD] });
    await vi.waitFor(() => expect(calls("/index-state").length).toBe(1));
    await sleep(20);
    fireEvent.click(screen.getByRole("button", { name: "Resync index" }));
    expect(await screen.findByText("Still indexing — refresh later.")).toBeInTheDocument();
  });
});
