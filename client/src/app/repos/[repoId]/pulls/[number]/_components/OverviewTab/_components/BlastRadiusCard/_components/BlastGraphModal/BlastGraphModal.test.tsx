import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import blast from "../../../../../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../../../../../messages/en/brief.json";
import { BlastRadiusCard } from "../../BlastRadiusCard";
import { fileName, graphModalWidth, layoutBlastGraph } from "./graph-layout";

const BLAST = {
  changed_symbols: [{ name: "getContext", file: "src/ctx.ts", kind: "function" }],
  downstream: [
    {
      symbol: "getContext",
      callers: [
        { name: "smartDiffRoutes", file: "src/smart-diff/routes.ts", line: 21 },
        { name: "intentRoutes", file: "src/intent/routes.ts", line: 40 },
      ],
      endpoints_affected: ["GET /smart-diff"],
      crons_affected: ["nightly"],
    },
  ],
  summary: "s",
  degraded: false,
  reason: null,
  caller_facts: [
    { file: "src/smart-diff/routes.ts", endpoints: ["GET /smart-diff"], crons: [] },
    { file: "src/intent/routes.ts", endpoints: [], crons: ["nightly"] },
  ],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function renderCard(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      json(url.endsWith("/history") ? { history: [], degraded: false, reason: null } : payload),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
        <BlastRadiusCard prId="p1" repoId="r1" repoFullName="acme/api" headSha="abc" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BlastGraphModal — Graph button", () => {
  it("opens a modal with four counted columns, keeps the tree, and closes back to the button", async () => {
    renderCard(BLAST);
    const button = await screen.findByRole("button", { name: "Graph" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(button);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("routes.ts:21")).toBeInTheDocument();
    expect(within(dialog).queryByText(/src\/smart-diff/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("Symbols (1)")).toBeInTheDocument();
    expect(within(dialog).getByText("Callers (2)")).toBeInTheDocument();
    expect(within(dialog).getByText("Endpoints (1)")).toBeInTheDocument();
    expect(within(dialog).getByText("Crons (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /getContext\(\)/ })).toBeInTheDocument(); // tree still rendered

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();

    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("has no Graph button when there is nothing downstream", async () => {
    renderCard({ ...BLAST, downstream: [], caller_facts: [] });
    expect(await screen.findByText(/no downstream callers found/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Graph" })).not.toBeInTheDocument();
  });
});

describe("layoutBlastGraph", () => {
  it("places nodes in four columns and joins them with curves; empty input has no nodes", () => {
    const layout = layoutBlastGraph(BLAST);
    expect(layout.counts).toEqual({ symbols: 1, callers: 2, endpoints: 1, crons: 1 });
    expect(layout.edges).toHaveLength(2 + 2); // symbol→callers, callers→endpoint/cron
    expect(layout.edges.every((e) => e.d.startsWith("M "))).toBe(true);
    const xs = new Set(layout.nodes.map((n) => n.x));
    expect(xs.size).toBe(4);
    expect(layoutBlastGraph({ ...BLAST, downstream: [], caller_facts: [] }).nodes).toEqual([]);
  });

  it("caller boxes show the caller name and file name only; the tooltip keeps the full path", () => {
    const caller = layoutBlastGraph(BLAST).nodes.find((n) => n.id === "callers:src/smart-diff/routes.ts:21");
    expect(caller).toMatchObject({
      label: "smartDiffRoutes",
      sublabel: "routes.ts:21",
      title: "smartDiffRoutes · src/smart-diff/routes.ts:21",
    });
    expect(fileName("client/src/app/agents/_components/AgentCard/AgentCard.test.tsx")).toBe("AgentCard.test.tsx");
    expect(fileName("README.md")).toBe("README.md");
  });

  it("sizes the modal to the canvas (+ scroll padding and border), so there is no horizontal scroll", () => {
    const layout = layoutBlastGraph(BLAST);
    expect(graphModalWidth(layout)).toBe(layout.width + 8 * 2 + 2);
  });
});
