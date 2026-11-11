import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrBriefRecord, PrBriefView, ReviewRecord } from "@devdigest/shared";
import brief from "../../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import { installFetch, calledRequests, type FakeResponse } from "@/test/fetch-router";

vi.mock("@/lib/toast", () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), toast: vi.fn() },
}));

import { notify } from "@/lib/toast";
import { createQueryClient } from "@/lib/query-client";
import { BriefBanner } from "./BriefBanner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(notify.error).mockClear();
});

function record(extra: Partial<PrBriefRecord> = {}): PrBriefRecord {
  return {
    intent: null,
    blast: { changed_symbols: [], downstream: [], summary: "", degraded: false, reason: null, caller_facts: [] },
    risks: { risks: [] },
    history: null,
    summary: "Adds a retry layer to the sync job.",
    review_focus: [],
    head_sha: "abc",
    generated_at: "2026-11-10T10:00:00.000Z",
    provider: "openai",
    model: "gpt-4.1",
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.0123,
    ...extra,
  };
}

function finding(id: string, severity: string, dismissed = false): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title: id,
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: dismissed ? "2026-11-10T00:00:00.000Z" : null,
  } as FindingRecord;
}

function review(id: string, extra: Partial<ReviewRecord>): ReviewRecord {
  return {
    id,
    pr_id: "p1",
    agent_id: "a1",
    run_id: null,
    agent_name: "Security",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-11-10T09:00:00.000Z",
    findings: [],
    ...extra,
  };
}

// newest first, as GET /pulls/:id/reviews returns; the newest has no verdict
const REVIEWS: ReviewRecord[] = [
  review("r3", { kind: "summary", verdict: null, score: 99 }),
  review("r2", {
    verdict: "request_changes",
    score: 71,
    findings: [
      finding("c1", "CRITICAL"),
      finding("c2", "CRITICAL"),
      finding("c3", "CRITICAL", true),
      finding("w1", "WARNING"),
      finding("w2", "WARNING"),
      finding("s1", "SUGGESTION"),
    ],
  }),
  review("r1", { verdict: "approve", score: 10 }),
];

interface Setup {
  getBrief?: FakeResponse | "never";
  postBrief?: FakeResponse | "never";
  reviews?: ReviewRecord[];
  qc?: QueryClient;
}

function renderBanner({ getBrief, postBrief, reviews = [], qc }: Setup = {}) {
  const spy = installFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/brief")) {
      if (method === "POST") return postBrief === "never" ? new Promise<never>(() => {}) : postBrief;
      return getBrief === "never" ? new Promise<never>(() => {}) : getBrief;
    }
    if (url.endsWith("/reviews")) return { body: reviews };
    return undefined;
  });
  const client = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
        <BriefBanner prId="p1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return spy;
}

const view = (b: PrBriefRecord | null, stale = false): FakeResponse => ({ body: { brief: b, stale } satisfies PrBriefView });

describe("BriefBanner — states", () => {
  it("is busy while loading (AC-30)", () => {
    renderBanner({ getBrief: "never" });
    expect(screen.getByRole("region", { name: "PR brief" })).toHaveAttribute("aria-busy", "true");
  });

  it("empty: shows the text, hint and Generate button, never POSTs on mount, then disables while generating (AC-31, AC-33, AC-36)", async () => {
    const spy = renderBanner({ getBrief: view(null), postBrief: "never" });
    expect(await screen.findByText("Brief not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Generate a brief to see a summary, risk areas and review focus.")).toBeInTheDocument();
    expect(calledRequests(spy).some((r) => r.startsWith("POST"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    const pending = await screen.findByRole("button", { name: "Generating brief…" });
    expect(pending).toBeDisabled();
    expect(calledRequests(spy).filter((r) => r.startsWith("POST"))).toEqual(["POST /pulls/p1/brief"]);
  });

  it("a failed GET shows an error state with a retry button (AC-35)", async () => {
    renderBanner({ getBrief: { status: 500, body: { error: { code: "x", message: "db down" } } } });
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByText("Couldn't load the PR brief")).toBeInTheDocument();
    expect(retry).toBeEnabled();
  });

  it("a failed POST shows the API message and the model hint inline, keeps the summary, and raises no toast (AC-34, AC-66, EC-16)", async () => {
    renderBanner({
      getBrief: view(record()),
      postBrief: { status: 502, body: { error: { code: "external_service_error", message: "Model timed out" } } },
      qc: createQueryClient(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Model timed out");
    expect(alert).toHaveTextContent("If this keeps failing, check the Risk Brief model in Settings → Models.");
    expect(screen.getByText("Adds a retry layer to the sync job.")).toBeInTheDocument();
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("while regenerating, the refresh button is disabled and the old summary stays (AC-33)", async () => {
    renderBanner({ getBrief: view(record()), postBrief: "never" });
    fireEvent.click(await screen.findByRole("button", { name: "Refresh brief" }));
    expect(await screen.findByRole("button", { name: "Generating brief…" })).toBeDisabled();
    expect(screen.getByText("Adds a retry layer to the sync job.")).toBeInTheDocument();
  });

  it("refresh POSTs and shows the fresh brief (AC-41)", async () => {
    const spy = renderBanner({
      getBrief: view(record(), true),
      postBrief: view(record({ summary: "Fresh summary." })),
    });
    expect(await screen.findByText("PR changed since the brief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh brief" }));
    expect(await screen.findByText("Fresh summary.")).toBeInTheDocument();
    expect(calledRequests(spy)).toContain("POST /pulls/p1/brief");
  });
});

describe("BriefBanner — ready content", () => {
  it("shows the verdict, counts, score of the newest review with a verdict, the tooltip and the cost (AC-38, AC-39, AC-42, AC-43, EC-17)", async () => {
    renderBanner({ getBrief: view(record()), reviews: REVIEWS });
    expect(await screen.findByText("Adds a retry layer to the sync job.")).toBeInTheDocument();
    expect(await screen.findByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("6 findings · 2 blockers")).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.queryByText("PR changed since the brief")).not.toBeInTheDocument();

    const tip = screen.getByRole("tooltip", { hidden: true });
    expect(tip).not.toBeVisible();
    const info = screen.getByRole("button", { name: "About these counts" });
    expect(info).toHaveAttribute("aria-describedby", tip.id);
    fireEvent.focus(info);
    await waitFor(() => expect(tip).toBeVisible());
    expect(tip.textContent).toMatch(/^From the latest review · Security · /);

    const cost = screen.getByTestId("brief-cost");
    expect(cost).toHaveTextContent("$0.012");
    expect(cost).toHaveTextContent("8.2K→1.3K");
  });

  it("with no review: 'No review yet', no counts, no score; cost hidden when all null (AC-40, AC-42)", async () => {
    renderBanner({
      getBrief: view(record({ cost_usd: null, tokens_in: null, tokens_out: null })),
      reviews: [review("r9", { kind: "summary", verdict: null, score: 50 })],
    });
    expect(await screen.findByText("No review yet")).toBeInTheDocument();
    expect(screen.getByText("Adds a retry layer to the sync job.")).toBeInTheDocument();
    expect(screen.queryByText(/findings ·/)).not.toBeInTheDocument();
    expect(screen.queryByText("PR score")).not.toBeInTheDocument();
    expect(screen.queryByTestId("brief-cost")).not.toBeInTheDocument();
  });

  it("a verdict review without a score hides the score ring but keeps the counts (EC-18)", async () => {
    renderBanner({ getBrief: view(record()), reviews: [review("r5", { verdict: "approve", score: null })] });
    expect(await screen.findByText("0 findings · 0 blockers")).toBeInTheDocument();
    expect(screen.queryByText("PR score")).not.toBeInTheDocument();
  });
});
