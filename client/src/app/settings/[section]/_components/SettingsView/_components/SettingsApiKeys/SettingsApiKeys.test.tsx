import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";

const mutate = vi.fn();
let testState: Record<string, unknown> = { isPending: false, isSuccess: false, isError: false };
vi.mock("@/lib/hooks/settings", () => ({
  useTestConnection: () => ({ mutate, ...testState }),
  useSecretsStatus: () => ({ data: { openai: true, anthropic: false, openrouter: false, github: false } }),
}));

import { SettingsApiKeys } from "./SettingsApiKeys";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  testState = { isPending: false, isSuccess: false, isError: false };
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <SettingsApiKeys />
    </NextIntlClientProvider>,
  );
}

describe("SettingsApiKeys (smoke)", () => {
  it("renders a row per provider with its configured status", () => {
    renderWithIntl();
    expect(screen.getByText("OpenAI API key")).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getAllByText("Not set")).toHaveLength(3);
  });
});

describe("SettingsApiKeys — key row", () => {
  it("the reveal control is a labelled button that toggles the input type", () => {
    renderWithIntl();
    const [reveal] = screen.getAllByRole("button", { name: "Show key" });
    const input = screen.getAllByPlaceholderText(/stored via SecretsProvider/)[0]!;
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(reveal!);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide key" })).toHaveAttribute("aria-pressed", "true");
  });

  it("tests the typed key and shows the outcome from the mutation", () => {
    testState = { isPending: false, isSuccess: true, isError: false, data: { ok: true, message: "Key works" } };
    renderWithIntl();
    fireEvent.change(screen.getAllByPlaceholderText(/stored via SecretsProvider/)[0]!, { target: { value: " sk-1 " } });
    fireEvent.click(screen.getAllByRole("button", { name: "Test connection" })[0]!);
    expect(mutate).toHaveBeenCalledWith({ provider: "openai", key: "sk-1" });
    expect(screen.getAllByText("Key works").length).toBeGreaterThan(0);
  });
});
