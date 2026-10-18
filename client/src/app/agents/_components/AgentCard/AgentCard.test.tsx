import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import common from "../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({
  useDeleteAgent: () => ({ mutate, isPending: false }),
}));

import { AgentCard } from "./AgentCard";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and linked-skill count", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, skill_count: 3 }} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("AgentCard — delete", () => {
  it("asks in a dialog (not window.confirm) and deletes only on confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const onClick = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("“Security Reviewer” will be permanently removed");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete agent" }));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(mutate).toHaveBeenCalledWith("ag1", expect.anything());
    // Clicks inside the dialog never open the agent.
    expect(onClick).not.toHaveBeenCalled();
  });
});
