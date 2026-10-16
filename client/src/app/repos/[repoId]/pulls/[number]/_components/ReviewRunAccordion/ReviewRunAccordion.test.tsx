import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";

const deleteReview = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: deleteReview, isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(() => {
  cleanup();
  deleteReview.mockClear();
  vi.restoreAllMocks();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rv1",
  accepted_at: null,
  dismissed_at: null,
};

const REVIEW: ReviewRecord = {
  id: "rv1",
  pr_id: "pr1",
  agent_id: "ag1",
  run_id: "run1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "request_changes",
  summary: "Secret committed.",
  score: 42,
  model: "gpt-4.1",
  created_at: "2026-10-01T10:00:00Z",
  findings: [FINDING, { ...FINDING, id: "f2", title: "SSRF webhook" }],
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ReviewRunAccordion (smoke)", () => {
  it("shows the agent, verdict and finding count in the header (e2e flow 04 waits on these)", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("request changes")).toBeInTheDocument();
    expect(screen.getByText(/2 findings/)).toBeInTheDocument();
  });
});

describe("ReviewRunAccordion — toggling", () => {
  it("opens and closes from the chevron button (keyboard entry point)", () => {
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" />);
    const toggle = screen.getByRole("button", { name: /Expand Security Reviewer review run/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Collapse/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("delete does not toggle the run open", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl(<ReviewRunAccordion review={REVIEW} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete this review run" }));
    expect(deleteReview).toHaveBeenCalledWith("rv1");
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});
