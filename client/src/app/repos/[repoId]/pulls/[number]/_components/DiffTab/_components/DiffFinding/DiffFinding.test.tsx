import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { DiffFinding } from "./DiffFinding";

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "A live key is committed in source.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

/** Keeps the PR's reviews query mounted so an invalidation shows up as a refetch. */
function ReviewsProbe() {
  usePrReviews("p1");
  return null;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    String(url).includes("/findings/") ? json({ finding: FINDING }) : json([]),
  );
  vi.stubGlobal("fetch", fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewsProbe />
        <DiffFinding f={FINDING} prId="p1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  const calls = () => fetchMock.mock.calls.map(([u, init]) => `${init?.method ?? "GET"} ${String(u)}`);
  return calls;
}

describe("DiffFinding — actions", () => {
  it("accept and dismiss post to the finding and refetch the reviews", async () => {
    const calls = setup();
    await waitFor(() => expect(calls().some((c) => c.endsWith("/pulls/p1/reviews"))).toBe(true));
    const reviewFetches = () => calls().filter((c) => c.endsWith("/pulls/p1/reviews")).length;
    const before = reviewFetches();

    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(calls().some((c) => c.startsWith("POST") && c.endsWith("/findings/f1/accept"))).toBe(true));
    await waitFor(() => expect(reviewFetches()).toBe(before + 1));

    fireEvent.click(screen.getByText("Dismiss"));
    await waitFor(() => expect(calls().some((c) => c.startsWith("POST") && c.endsWith("/findings/f1/dismiss"))).toBe(true));
    await waitFor(() => expect(reviewFetches()).toBe(before + 2));
  });
});

describe("DiffFinding — collapse", () => {
  it("a click on the title collapses the card to one line; the title stays", () => {
    setup();
    expect(screen.getByText("A live key is committed in source.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key"));
    expect(screen.queryByText("A live key is committed in source.")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
  });
});
