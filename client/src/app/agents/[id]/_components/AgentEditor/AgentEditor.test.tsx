import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import common from "../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

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

describe("A2 Agent Editor (smoke)", () => {
  it("has exactly two tabs: Config and Skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const tabs = screen.getAllByRole("button").filter((b) => ["Config", "Skills"].includes(b.textContent ?? ""));
    expect(tabs.map((b) => b.textContent)).toEqual(["Config", "Skills"]);
  });

  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });
});

describe("A2 Agent Editor — switching agents", () => {
  it("resets the Config form to the newly selected agent", () => {
    const wrap = (agent: Agent) => (
      <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
        <ToastProvider>
          <AgentEditor agent={agent} tab="config" onTab={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>
    );
    const { rerender } = render(wrap(AGENT));
    expect(screen.getByDisplayValue("Security Reviewer")).toBeInTheDocument();

    rerender(wrap({ ...AGENT, id: "ag2", name: "Perf Reviewer" }));
    expect(screen.getByDisplayValue("Perf Reviewer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Security Reviewer")).not.toBeInTheDocument();
  });
});

