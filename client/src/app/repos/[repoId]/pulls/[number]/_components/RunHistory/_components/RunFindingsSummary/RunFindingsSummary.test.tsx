import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../../../messages/en/common.json";
import { RunFindingsSummary } from "./RunFindingsSummary";

afterEach(cleanup);

describe("RunFindingsSummary (smoke)", () => {
  it("falls back to the plain count and appends blockers when the review isn't loaded", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
        <RunFindingsSummary run={{ findings_count: 4, blockers: 2 }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/4 finding\(s\) · 2 blockers/)).toBeInTheDocument();
  });
});
