import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
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
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity pills", () => {
  const MIXED: FindingRecord[] = [
    { ...FINDINGS[0]!, id: "c1", title: "Hardcoded secret" },
    { ...FINDINGS[0]!, id: "c2", title: "SSRF webhook" },
    { ...FINDINGS[0]!, id: "w1", severity: "WARNING", title: "N+1 query" },
  ];

  it("renders a pill with a count per severity present (none for absent ones)", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("button", { name: /Critical\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Warning\s*1/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggestion/ })).not.toBeInTheDocument();
  });

  it("clicking a pill filters to that severity; clicking it again shows all", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const critical = screen.getByRole("button", { name: /Critical/ });
    fireEvent.click(critical);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SSRF webhook")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();

    fireEvent.click(critical);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("is single-select: another pill replaces the active filter", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    fireEvent.click(screen.getByRole("button", { name: /Warning/ }));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});
