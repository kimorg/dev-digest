import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrDetail } from "@/lib/types";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/reviews", () => ({ useRunReview: () => ({ mutate: vi.fn(), isPending: false }) }));

import { PrDetailHeader } from "./PrDetailHeader";

afterEach(cleanup);

const PR = {
  number: 482,
  title: "Add rate limiting",
  author: "ana",
  branch: "feat/rate",
  base: "main",
  additions: 10,
  deletions: 2,
  status: "open",
  files_count: 3,
} as unknown as PrDetail;

function renderHeader(pr: PrDetail, onSetTab = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PrDetailHeader
        pr={pr}
        prId="p1"
        tab="overview"
        findingsCount={2}
        githubUrl={null}
        onSetTab={onSetTab}
        onRunStart={() => {}}
        onRunsStarted={() => {}}
      />
    </NextIntlClientProvider>,
  );
  return onSetTab;
}

describe("PrDetailHeader — tabs", () => {
  it("names the tabs the e2e flows click ('Agent runs', 'Files changed')", () => {
    const onSetTab = renderHeader(PR);
    fireEvent.click(screen.getByRole("button", { name: /Agent runs/ }));
    expect(onSetTab).toHaveBeenCalledWith("findings");
    fireEvent.click(screen.getByRole("button", { name: /Files changed/ }));
    expect(onSetTab).toHaveBeenCalledWith("diff");
  });
});

describe("PrDetailHeader — closed PRs", () => {
  it("warns that a review of a merged PR is informational only", () => {
    renderHeader({ ...PR, status: "merged" } as PrDetail);
    expect(screen.getByText(/This PR is already merged/)).toBeInTheDocument();
  });

  it("shows no warning on an open PR", () => {
    renderHeader(PR);
    expect(screen.queryByText(/already/)).not.toBeInTheDocument();
  });
});
