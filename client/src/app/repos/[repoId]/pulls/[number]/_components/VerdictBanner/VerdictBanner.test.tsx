import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("shows the run's tokens · cost line when cost data is passed", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="comment"
        summary={null}
        score={80}
        findingsCount={2}
        blockers={0}
        costUsd={0.014}
        tokensIn={8_200}
        tokensOut={1_300}
      />,
    );
    expect(screen.getByText("9,500 tok · $0.014")).toBeInTheDocument();
  });

  it("hides the cost line when the run has no cost/token data", () => {
    renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={95} findingsCount={0} blockers={0} />,
    );
    expect(screen.queryByTestId("run-cost-badge")).not.toBeInTheDocument();
  });
});
