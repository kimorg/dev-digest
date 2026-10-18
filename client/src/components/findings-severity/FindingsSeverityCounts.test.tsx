import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import common from "../../../messages/en/common.json";

const reviewsState: { data?: ReviewRecord[]; isLoading: boolean; isError: boolean } = {
  isLoading: false,
  isError: false,
};
const usePrReviews = vi.fn((_prId: string) => reviewsState);
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: (id: string) => usePrReviews(id) }));

import { FindingsSeverityCounts } from "./FindingsSeverityCounts";
import { countBySeverity, latestReviewPerAgent, sortBySeverity } from "./helpers";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS } from "./constants";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  usePrReviews.mockClear();
  reviewsState.data = undefined;
});

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a **secret** key.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "c1", title: "Hardcoded secret" }),
  finding({ id: "c2", title: "Lethal trifecta", dismissed_at: "2026-10-01T00:00:00Z" }),
  finding({ id: "w1", severity: "WARNING", category: "perf", title: "N+1 query", start_line: 45, end_line: 52 }),
];

function renderCounts(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("countBySeverity", () => {
  it("counts every finding per severity, dismissed included", () => {
    expect(countBySeverity(FINDINGS)).toEqual({ critical: 2, warning: 1, suggestion: 0 });
  });
});

describe("FindingsSeverityCounts", () => {
  it("renders one count per non-zero severity", () => {
    renderCounts(<FindingsSeverityCounts counts={countBySeverity(FINDINGS)} findings={FINDINGS} />);
    expect(screen.getByRole("button", { name: "2 critical findings" })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "1 warning finding" })).toHaveTextContent("1");
    expect(screen.queryByRole("button", { name: /suggestion/ })).not.toBeInTheDocument();
  });

  it("renders '—' when there are no counts", () => {
    renderCounts(<FindingsSeverityCounts counts={null} />);
    expect(screen.getByTestId("findings-severity-none")).toHaveTextContent("—");
    cleanup();
    renderCounts(<FindingsSeverityCounts counts={{ critical: 0, warning: 0, suggestion: 0 }} />);
    expect(screen.getByTestId("findings-severity-none")).toBeInTheDocument();
  });

  it("clicking a count opens a popover with only that severity; clicking again closes it", () => {
    renderCounts(
      <FindingsSeverityCounts
        counts={countBySeverity(FINDINGS)}
        findings={FINDINGS}
        repoFullName="acme/payments-api"
        headSha="abc123"
      />,
    );
    const crit = screen.getByRole("button", { name: "2 critical findings" });
    fireEvent.click(crit);
    const dialog = screen.getByRole("dialog");
    expect(crit).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByText("2 critical")).toBeInTheDocument();
    expect(within(dialog).getByText("Hardcoded secret")).toBeInTheDocument();
    expect(within(dialog).getByText("Lethal trifecta")).toBeInTheDocument();
    expect(within(dialog).queryByText("N+1 query")).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("link")[0]).toHaveAttribute(
      "href",
      expect.stringContaining("acme/payments-api/blob/abc123/src/config.ts#L12"),
    );

    fireEvent.click(crit);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switches severity and closes on Escape", () => {
    renderCounts(<FindingsSeverityCounts counts={countBySeverity(FINDINGS)} findings={FINDINGS} />);
    fireEvent.click(screen.getByRole("button", { name: "2 critical findings" }));
    fireEvent.click(screen.getByRole("button", { name: "1 warning finding" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("N+1 query")).toBeInTheDocument();
    expect(within(dialog).queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not let clicks bubble to a clickable parent (PR row)", () => {
    const onRowClick = vi.fn();
    renderCounts(
      <div onClick={onRowClick}>
        <FindingsSeverityCounts counts={countBySeverity(FINDINGS)} findings={FINDINGS} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "2 critical findings" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Hardcoded secret"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("without in-memory findings, fetches the PR's reviews only once opened", () => {
    reviewsState.data = [
      {
        id: "r1",
        pr_id: "pr1",
        agent_id: null,
        run_id: null,
        kind: "review",
        verdict: "request_changes",
        summary: null,
        score: 40,
        model: null,
        created_at: "2026-10-01T00:00:00Z",
        findings: FINDINGS,
      },
    ];
    renderCounts(<FindingsSeverityCounts counts={{ critical: 2, warning: 1, suggestion: 0 }} prId="pr1" />);
    expect(usePrReviews).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "1 warning finding" }));
    expect(usePrReviews).toHaveBeenCalledWith("pr1");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("N+1 query")).toBeInTheDocument();
    expect(within(dialog).queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});

function review(
  id: string,
  createdAt: string,
  findings: FindingRecord[],
  agentId: string | null = null,
): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id: agentId,
    run_id: null,
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 40,
    model: null,
    created_at: createdAt,
    findings,
  };
}

describe("latestReviewPerAgent", () => {
  it("keeps the newest review of each agent (agent-less reviews are one group), skips summaries", () => {
    const picked = latestReviewPerAgent([
      review("a2", "2026-10-03T00:00:00Z", [], "agentA"),
      { ...review("sum", "2026-10-03T00:00:00Z", [], "agentB"), kind: "summary" },
      review("b1", "2026-10-02T00:00:00Z", [], "agentB"),
      review("a1", "2026-10-01T00:00:00Z", [], "agentA"),
      review("n2", "2026-10-01T00:00:00Z", []),
      review("n1", "2026-09-30T00:00:00Z", []),
    ]);
    expect(picked.map((r) => r.id)).toEqual(["a2", "b1", "n2"]);
  });
});

describe("sortBySeverity", () => {
  it("orders CRITICAL → WARNING → SUGGESTION, stable within a severity", () => {
    const sorted = sortBySeverity([
      finding({ id: "s1", severity: "SUGGESTION" }),
      finding({ id: "w1", severity: "WARNING" }),
      finding({ id: "c1" }),
      finding({ id: "c2" }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["c1", "c2", "w1", "s1"]);
  });
});

describe("FindingsSeverityCounts — hover trigger (PR list)", () => {
  const COUNTS = { critical: 1, warning: 1, suggestion: 1 };
  // Reviews come newest-first from the API; only each agent's newest one is listed.
  const LATEST = [
    finding({ id: "s1", severity: "SUGGESTION", category: "style", title: "Rename helper" }),
    finding({ id: "c1", title: "Hardcoded secret" }),
  ];
  const OTHER_AGENT = [finding({ id: "w1", severity: "WARNING", category: "perf", title: "N+1 query" })];
  const OLDER = [finding({ id: "old", title: "Old finding from an earlier review" })];

  function hoverCell() {
    fireEvent.mouseEnter(screen.getByTestId("findings-severity"));
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_MS);
    });
  }

  it("renders plain counts (no buttons) and opens one popover with all findings on hover", () => {
    vi.useFakeTimers();
    reviewsState.data = [
      review("a2", "2026-10-03T00:00:00Z", LATEST, "agentA"),
      review("b1", "2026-10-02T00:00:00Z", OTHER_AGENT, "agentB"),
      review("a1", "2026-10-01T00:00:00Z", OLDER, "agentA"),
    ];
    renderCounts(<FindingsSeverityCounts counts={COUNTS} prId="pr1" trigger="hover" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByLabelText("1 critical finding")).toHaveTextContent("1");
    expect(usePrReviews).not.toHaveBeenCalled();

    hoverCell();
    expect(usePrReviews).toHaveBeenCalledWith("pr1");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("3 findings · latest run per agent")).toBeInTheDocument();
    const titles = within(dialog)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(titles[0]).toContain("Hardcoded secret");
    expect(titles[1]).toContain("N+1 query");
    expect(titles[2]).toContain("Rename helper");
    expect(within(dialog).queryByText("Old finding from an earlier review")).not.toBeInTheDocument();
  });

  it("does not open when the pointer only sweeps across the cell", () => {
    vi.useFakeTimers();
    renderCounts(<FindingsSeverityCounts counts={COUNTS} prId="pr1" trigger="hover" />);
    const cell = screen.getByTestId("findings-severity");
    fireEvent.mouseEnter(cell);
    fireEvent.mouseLeave(cell);
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_MS + HOVER_CLOSE_MS);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays open while the pointer moves into the popover; closes after leaving it", () => {
    vi.useFakeTimers();
    reviewsState.data = [review("r2", "2026-10-02T00:00:00Z", LATEST)];
    renderCounts(<FindingsSeverityCounts counts={COUNTS} prId="pr1" trigger="hover" />);
    hoverCell();
    const cell = screen.getByTestId("findings-severity");
    expect(cell).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseLeave(cell);
    fireEvent.mouseEnter(screen.getByRole("dialog"));
    act(() => {
      vi.advanceTimersByTime(HOVER_CLOSE_MS * 2);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole("dialog"));
    act(() => {
      vi.advanceTimersByTime(HOVER_CLOSE_MS);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cell).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on keyboard focus and closes on Escape", () => {
    vi.useFakeTimers();
    reviewsState.data = [review("r2", "2026-10-02T00:00:00Z", LATEST)];
    renderCounts(<FindingsSeverityCounts counts={COUNTS} prId="pr1" trigger="hover" />);
    fireEvent.focus(screen.getByTestId("findings-severity"));
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_MS);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not let clicks inside the popover bubble to the PR row", () => {
    vi.useFakeTimers();
    reviewsState.data = [review("r2", "2026-10-02T00:00:00Z", LATEST)];
    const onRowClick = vi.fn();
    renderCounts(
      <div onClick={onRowClick}>
        <FindingsSeverityCounts counts={COUNTS} prId="pr1" trigger="hover" />
      </div>,
    );
    hoverCell();
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Hardcoded secret"));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
