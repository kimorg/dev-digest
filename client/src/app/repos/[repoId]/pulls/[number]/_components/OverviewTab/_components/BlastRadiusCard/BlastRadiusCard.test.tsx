import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import blast from "../../../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../../../messages/en/brief.json";
import { BlastRadiusCard } from "./BlastRadiusCard";

const BLAST = {
  changed_symbols: [
    { name: "getContext", file: "src/ctx.ts", kind: "function" },
    { name: "Settings", file: "src/ctx.ts", kind: "interface" },
  ],
  downstream: [
    {
      symbol: "getContext",
      callers: [
        { name: "smartDiffRoutes", file: "src/smart-diff/routes.ts", line: 21 },
        { name: "intentRoutes", file: "src/intent/routes.ts", line: 40 },
      ],
      endpoints_affected: ["GET /pulls/:id/smart-diff"],
      crons_affected: ["nightly-sync"],
    },
    {
      symbol: "Settings",
      callers: [{ name: "cfg", file: "src/cfg.ts", line: 3 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "s",
  degraded: false,
  reason: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const HISTORY = { history: [], degraded: false, reason: null };

/** fetch mock: `/history` gets an empty history, everything else the blast payload. */
function routed(body: unknown, status = 200) {
  return vi.fn(async (url: string) => (url.endsWith("/history") ? json(HISTORY) : json(body, status)));
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
        <BlastRadiusCard prId="p1" repoId="r1" repoFullName="acme/api" headSha="abc123" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// jsdom puts a space at each <wbr> in the accessible name (browsers do not), so compare without whitespace.
const pathName = (path: string) => (name: string) => name.replace(/\s+/g, "") === path;

describe("BlastRadiusCard — map", () => {
  it("shows stats, the first symbol open with GitHub links and chips, others collapsed", async () => {
    vi.stubGlobal("fetch", routed(BLAST));
    renderCard();

    expect(await screen.findByText("getContext()")).toBeInTheDocument();
    // The title is a label above the card (OverviewTab), not inside it; the region keeps the name.
    expect(screen.getByRole("region", { name: "Blast radius" })).toBeInTheDocument();
    expect(screen.queryByText("Blast radius")).not.toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument(); // interface: no parentheses
    const first = screen.getByRole("button", { name: /getContext\(\)/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(within(first).getByText("2 callers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/ })).toHaveAttribute("aria-expanded", "false");

    const link = screen.getByRole("link", { name: pathName("src/smart-diff/routes.ts:21") });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/blob/abc123/src/smart-diff/routes.ts#L21");
    expect(screen.getByText("GET /pulls/:id/smart-diff")).toBeInTheDocument();
    expect(screen.getByText("nightly-sync")).toBeInTheDocument();
    expect(screen.queryByText("src/cfg.ts:3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(screen.getByText("src/cfg.ts:3")).toBeInTheDocument();
  });
});

describe("BlastRadiusCard — states", () => {
  it("empty and not degraded → no-downstream message", async () => {
    vi.stubGlobal("fetch", routed({ ...BLAST, downstream: [], changed_symbols: [BLAST.changed_symbols[0]] }));
    renderCard();
    expect(await screen.findByText(/1 changed symbol\(s\), no downstream callers found/)).toBeInTheDocument();
    expect(screen.queryByText("Limited data")).not.toBeInTheDocument();
  });

  it("degraded → badge and reason, tree still shown when there is data", async () => {
    vi.stubGlobal("fetch", routed({ ...BLAST, degraded: true, reason: "index_partial" }));
    renderCard();
    expect(await screen.findByText("Limited data")).toBeInTheDocument();
    expect(screen.getByText(/index is partial/)).toBeInTheDocument();
    expect(screen.getByText("getContext()")).toBeInTheDocument();
  });

  it("offers Resync for no_data but only a hint for flag_off", async () => {
    vi.stubGlobal("fetch", routed({ ...BLAST, degraded: true, reason: "no_data" }));
    renderCard();
    expect(await screen.findByRole("button", { name: "Resync index" })).toBeInTheDocument();
    cleanup();

    vi.stubGlobal("fetch", routed({ ...BLAST, degraded: true, reason: "flag_off" }));
    renderCard();
    expect(await screen.findByText(/REPO_INTEL_ENABLED/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resync index" })).not.toBeInTheDocument();
  });

  it("error with no cached data → error state; Retry refetches", async () => {
    const fetchMock = routed({ error: { message: "boom" } }, 500);
    vi.stubGlobal("fetch", fetchMock);
    renderCard();
    expect(await screen.findByText("Couldn't load the blast radius")).toBeInTheDocument();
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
  });
});
