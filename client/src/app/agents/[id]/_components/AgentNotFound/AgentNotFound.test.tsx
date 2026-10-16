import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/agents.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { AgentNotFound } from "./AgentNotFound";

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("AgentNotFound (smoke)", () => {
  it("explains the missing agent and links back to the agents list", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <AgentNotFound />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to agents"));
    expect(push).toHaveBeenCalledWith("/agents");
  });
});
