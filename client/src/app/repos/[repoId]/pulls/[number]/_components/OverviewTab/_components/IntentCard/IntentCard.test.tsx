import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { IntentCard } from "./IntentCard";

const RECORD = {
  pr_id: "p1",
  intent: "Add rate limiting to public endpoints",
  in_scope: ["Token bucket limiter"],
  out_of_scope: ["User quotas"],
  confidence: "low",
  sources: [{ kind: "title" }, { kind: "files" }],
  provider: "openai",
  model: "gpt-4.1",
  generated_at: "2026-10-28T10:00:00.000Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
        <IntentCard prId="p1" repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntentCard — stored intent", () => {
  it("shows scope and the low-confidence hint; Recalculate posts and reports 'no changes'", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/intent/recalculate")) return json({ intent: RECORD, regenerated: false });
      if (url.endsWith("/intent")) return json({ intent: RECORD, stale: true });
      return json([]); // PR list / detail refetch
    });
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    expect(await screen.findByText(/Add rate limiting to public endpoints/)).toBeInTheDocument();
    expect(screen.getByText("Token bucket limiter")).toBeInTheDocument();
    expect(screen.getByText("User quotas")).toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText("PR changed since detection")).toBeInTheDocument();

    // Opening the page only read: no recalculate call yet.
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/intent/recalculate"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Recalculate" }));
    expect(await screen.findByText("No changes since the last detection.")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/intent/recalculate"));
    expect((post![1] as RequestInit).method).toBe("POST");
    // The result replaces the cached view → no longer stale.
    await waitFor(() => expect(screen.queryByText("PR changed since detection")).not.toBeInTheDocument());
  });
});

describe("IntentCard — empty and error", () => {
  it("explains when no intent has been detected yet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ intent: null, stale: false })));
    renderCard();
    expect(await screen.findByText(/Intent not detected yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recalculate" })).toBeInTheDocument();
  });

  it("shows an error state with a retry when loading fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "boom" } }, 500)));
    renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
