import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import common from "../../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
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

describe("ConfigTab — save", () => {
  it("saves the edited form as the agent patch", () => {
    renderWithIntl(<ConfigTab agent={AGENT} />);
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Sec v2" } });
    fireEvent.click(screen.getByText("Save agent"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      id: "ag1",
      patch: {
        name: "Sec v2",
        description: "Flags secrets and injection",
        provider: "openai",
        model: "gpt-4.1",
        system_prompt: "You are a security reviewer.",
        strategy: "single-pass",
        ci_fail_on: "critical",
        repo_intel: true,
        enabled: true,
      },
    });
  });
});
