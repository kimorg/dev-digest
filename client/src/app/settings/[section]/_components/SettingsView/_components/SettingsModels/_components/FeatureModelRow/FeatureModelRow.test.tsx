import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FeatureModelChoice, FeatureModelDef, ModelInfo, Provider } from "@/lib/types";
import messages from "../../../../../../../../../../messages/en/settings.json";

const MODELS: Record<Provider, ModelInfo[]> = {
  openai: [{ id: "gpt-4.1", provider: "openai" }],
  anthropic: [],
  openrouter: [
    { id: "anthropic/claude-haiku-5.5", provider: "openrouter" },
    { id: "deepseek/deepseek-v4-flash", provider: "openrouter" },
  ],
};
const requested: Provider[] = [];
vi.mock("@/lib/hooks/agents", () => ({
  useProviderModels: (provider: Provider) => {
    requested.push(provider);
    return { data: MODELS[provider] };
  },
}));

import { FeatureModelRow } from "./FeatureModelRow";

const FEATURE: FeatureModelDef = {
  id: "conventions",
  label: "Conventions",
  description: "Extracts coding conventions from the repo.",
  defaultProvider: "openai",
  defaultModel: "gpt-4.1",
};

afterEach(() => {
  cleanup();
  requested.length = 0;
});

function renderRow(chosen: FeatureModelChoice | undefined, onSave = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <FeatureModelRow feature={FEATURE} chosen={chosen} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return onSave;
}

describe("FeatureModelRow (smoke)", () => {
  it("shows the registry default provider and model, tagged as default", () => {
    renderRow(undefined);
    expect(screen.getByRole("combobox")).toHaveValue("openai");
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(requested.at(-1)).toBe("openai");
  });

  it("shows the saved provider and model without the default tag", () => {
    renderRow({ provider: "openrouter", model: "anthropic/claude-haiku-5.5" });
    expect(screen.getByRole("combobox")).toHaveValue("openrouter");
    expect(screen.getByText("anthropic/claude-haiku-5.5")).toBeInTheDocument();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
  });
});

describe("FeatureModelRow — provider switch", () => {
  it("switching the provider loads its models and saves nothing until a model is picked", () => {
    const onSave = renderRow(undefined);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "openrouter" } });

    expect(onSave).not.toHaveBeenCalled();
    expect(requested.at(-1)).toBe("openrouter");
    expect(screen.queryByText("gpt-4.1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Pick a model…"));
    fireEvent.click(screen.getByText("deepseek/deepseek-v4-flash"));
    expect(onSave).toHaveBeenCalledWith(
      { provider: "openrouter", model: "deepseek/deepseek-v4-flash" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("switching back to the saved provider restores its saved model", () => {
    renderRow({ provider: "openrouter", model: "anthropic/claude-haiku-5.5" });
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "openai" } });
    expect(screen.queryByText("anthropic/claude-haiku-5.5")).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "openrouter" } });
    expect(screen.getByText("anthropic/claude-haiku-5.5")).toBeInTheDocument();
  });

  it("an empty model list names the provider whose key is missing", () => {
    renderRow(undefined);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "anthropic" } });
    expect(screen.getByText("No models from anthropic — add its API key under API Keys.")).toBeInTheDocument();
  });
});
