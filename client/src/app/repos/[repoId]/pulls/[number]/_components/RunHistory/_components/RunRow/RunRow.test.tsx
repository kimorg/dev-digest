import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../../../messages/en/common.json";
import { RunRow } from "./RunRow";

afterEach(cleanup);

const RUN = {
  run_id: "run-1",
  agent_name: null,
  provider: "openai",
  model: "gpt-4.1",
  status: "done",
  error: null,
  ran_at: null,
  score: 80,
  blockers: 0,
  findings_count: 0,
  cost_usd: null,
  tokens_in: null,
  tokens_out: null,
} as unknown as RunSummary;

function renderRow(run: RunSummary, props: Partial<React.ComponentProps<typeof RunRow>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <RunRow run={run} onOpenTrace={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RunRow — actions", () => {
  it("delete is a real button that reports the run id; the agent name falls back to 'Agent'", () => {
    const onDelete = vi.fn();
    renderRow(RUN, { onDelete });
    expect(screen.getByRole("button", { name: "Agent" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete run" }));
    expect(onDelete).toHaveBeenCalledWith("run-1");
  });

  it("an in-flight run can't be deleted", () => {
    renderRow({ ...RUN, status: "running" }, { onDelete: vi.fn() });
    expect(screen.queryByRole("button", { name: "Delete run" })).not.toBeInTheDocument();
  });
});
