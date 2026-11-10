import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextPathsResult } from "@devdigest/shared";
import { useSetSkillContext } from "./context";
import { queryKeys } from "./query-keys";

const SKILL = "skill-1";
const KEY = queryKeys.skillContext(SKILL);

interface Pending {
  paths: string[];
  respond: (status: number) => void;
}

/** Stubs fetch: every PUT waits until the test answers it, so overlapping saves can be ordered by hand. */
function stubPuts() {
  const puts: Pending[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          const { paths } = JSON.parse(String(init?.body)) as { paths: string[] };
          puts.push({
            paths,
            respond: (status) =>
              resolve(
                new Response(
                  JSON.stringify(
                    status === 200
                      ? { paths: paths.map((path, order) => ({ path, order })) }
                      : { error: { code: "boom", message: "boom" } },
                  ),
                  { status, headers: { "content-type": "application/json" } },
                ),
              ),
          });
        }),
    ),
  );
  return puts;
}

function renderSave() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(KEY, { paths: [] });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSetSkillContext(SKILL), { wrapper });
  const cached = () => (qc.getQueryData<ContextPathsResult>(KEY)?.paths ?? []).map((p) => p.path);
  return { qc, result, cached };
}

afterEach(() => vi.unstubAllGlobals());

describe("useSetSkillContext — overlapping saves", () => {
  it("sends the saves one at a time, in order, and an older response does not overwrite a newer list", async () => {
    const puts = stubPuts();
    const { result, cached } = renderSave();

    act(() => result.current.mutate(["a.md"]));
    act(() => result.current.mutate(["a.md", "b.md"]));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(cached()).toEqual(["a.md", "b.md"]);

    await act(async () => puts[0]!.respond(200));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts.map((p) => p.paths)).toEqual([["a.md"], ["a.md", "b.md"]]);
    expect(cached()).toEqual(["a.md", "b.md"]);

    await act(async () => puts[1]!.respond(200));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(cached()).toEqual(["a.md", "b.md"]);
  });

  it("a failed save does not roll back over a newer save that is still pending", async () => {
    const puts = stubPuts();
    const { result, cached } = renderSave();

    act(() => result.current.mutate(["a.md"]));
    act(() => result.current.mutate(["a.md", "b.md"]));
    await waitFor(() => expect(puts).toHaveLength(1));

    await act(async () => puts[0]!.respond(500));
    // The next save is sent only after the failed one has finished, onError included.
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(cached()).toEqual(["a.md", "b.md"]);

    await act(async () => puts[1]!.respond(200));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(cached()).toEqual(["a.md", "b.md"]);
  });

  it("the last failed save rolls the list back to what it was before that save", async () => {
    const puts = stubPuts();
    const { result, cached } = renderSave();

    act(() => result.current.mutate(["a.md"]));
    await waitFor(() => expect(puts).toHaveLength(1));
    await act(async () => puts[0]!.respond(500));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cached()).toEqual([]);
  });
});
