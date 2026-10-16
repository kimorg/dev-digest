import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";

const cancel = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useCancelRun: () => ({ mutate: cancel, isPending: false }),
  useRunEvents: () => ({ events: [], running: true }),
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsTab } from "./FindingsTab";

afterEach(() => {
  cleanup();
  cancel.mockClear();
});

function renderTab(props: Partial<React.ComponentProps<typeof FindingsTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <FindingsTab
        prId="p1"
        liveRunIds={[]}
        lethalTrifecta={[]}
        runs={[]}
        prRuns={[]}
        prCommits={[]}
        onOpenTrace={() => {}}
        onDelete={() => {}}
        onRunDone={() => {}}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("FindingsTab (smoke)", () => {
  it("shows the empty state when there are no runs and nothing is running", () => {
    renderTab();
    expect(screen.getByText("No findings yet")).toBeInTheDocument();
  });

  it("renders one accordion per review run", () => {
    const review = {
      id: "rv1",
      run_id: "run1",
      agent_name: "Security Reviewer",
      verdict: "approve",
      summary: null,
      score: 90,
      created_at: "2026-10-01T00:00:00Z",
      findings: [],
    } as unknown as ReviewRecord;
    renderTab({ runs: [review] });
    // The newest run starts open (its banner repeats the agent name).
    expect(screen.getByRole("button", { name: "Collapse Security Reviewer review run" })).toBeInTheDocument();
    expect(screen.queryByText("No findings yet")).not.toBeInTheDocument();
  });
});

describe("FindingsTab — live runs", () => {
  it("shows the live section and cancels every in-flight run", () => {
    renderTab({ liveRunIds: ["a", "b"] });
    expect(screen.getByText("Review in progress…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(cancel.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });
});
