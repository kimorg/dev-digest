import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { DiffOrderToggle } from "./DiffOrderToggle";

afterEach(cleanup);

describe("DiffOrderToggle — segmented control", () => {
  it("shows which order is active and reports a change", () => {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <DiffOrderToggle value="smart" onChange={onChange} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("group", { name: "File order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Original order" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(onChange).toHaveBeenCalledWith("original");
  });
});
