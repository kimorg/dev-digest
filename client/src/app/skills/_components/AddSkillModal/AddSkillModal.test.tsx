import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportDraft } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";

const create = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown };
const preview = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown };
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => create,
  useSkillImportPreview: () => preview,
}));

import { AddSkillModal } from "./AddSkillModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DRAFT: SkillImportDraft = {
  name: "Flaky Test Patterns",
  description: "Flag tests whose result depends on timing.",
  type: "custom",
  body: "# Flaky Test Patterns\n\n**Flag as WARNING** a fixed sleep.",
  ignored_files: ["flaky-test-patterns/scripts/check.sh"],
  warnings: [],
};

function renderModal() {
  const onCreated = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <AddSkillModal onClose={() => {}} onCreated={onCreated} />
    </NextIntlClientProvider>,
  );
  return { onCreated };
}

describe("AddSkillModal — create", () => {
  it("enables Create skill only when all four fields are filled, then sends a manual skill", () => {
    renderModal();
    const submit = screen.getByRole("button", { name: "Create skill" });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/Write it as a directive/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Edge Cases " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Check boundaries." } });
    fireEvent.change(screen.getByPlaceholderText(/Describe what to flag/), { target: { value: "# Rule" } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(create.mutate).toHaveBeenCalledWith(
      { name: "Edge Cases", description: "Check boundaries.", type: "rubric", body: "# Rule", source: "manual" },
      expect.anything(),
    );
  });
});

describe("AddSkillModal — from file", () => {
  it("previews the archive (nothing saved), shows trust note + ignored files, imports as imported_file", async () => {
    preview.mutate.mockImplementation((_input, opts) => opts.onSuccess(DRAFT));
    renderModal();
    fireEvent.click(screen.getByText("From file"));

    const file = new File(["zip-bytes"], "flaky-test-patterns.zip", { type: "application/zip" });
    fireEvent.change(screen.getByTestId("skill-import-input"), { target: { files: [file] } });

    await waitFor(() => expect(preview.mutate).toHaveBeenCalled());
    expect(preview.mutate.mock.calls[0]![0]).toEqual({
      filename: "flaky-test-patterns.zip",
      content_base64: btoa("zip-bytes"),
    });
    expect(create.mutate).not.toHaveBeenCalled();

    expect(await screen.findByRole("note")).toHaveTextContent("someone else's instructions");
    expect(screen.getByText("1 ignored file — never executed or stored")).toBeInTheDocument();
    // Rendered markdown, not the raw text.
    expect(screen.getByTestId("skill-import-preview").querySelector("h1")).toHaveTextContent("Flaky Test Patterns");

    fireEvent.click(screen.getByRole("button", { name: "Import (disabled)" }));
    expect(create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Flaky Test Patterns", source: "imported_file" }),
      expect.anything(),
    );
  });

  it("rejects a file over 512 KB without calling the server", () => {
    renderModal();
    fireEvent.click(screen.getByText("From file"));
    const big = new File([new Uint8Array(512 * 1024 + 1)], "big.zip");
    fireEvent.change(screen.getByTestId("skill-import-input"), { target: { files: [big] } });
    expect(screen.getByRole("alert")).toHaveTextContent("larger than 512 KB");
    expect(preview.mutate).not.toHaveBeenCalled();
  });
});
