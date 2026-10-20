import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../messages/en/conventions.json";
import { ConventionsToolbar } from "./ConventionsToolbar";

afterEach(cleanup);

function renderToolbar(accepted: number, total: number) {
  const props = { onAcceptAll: vi.fn(), onDeselectAll: vi.fn(), onCreateSkill: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ConventionsToolbar accepted={accepted} total={total} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("ConventionsToolbar — create skill", () => {
  it("hides Create skill until a candidate is accepted", () => {
    const props = renderToolbar(0, 3);
    expect(screen.getByText("0 of 3 accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(props.onAcceptAll).toHaveBeenCalled();
  });

  it("shows Create skill and Deselect all once everything is accepted", () => {
    const props = renderToolbar(3, 3);
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(props.onCreateSkill).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(props.onDeselectAll).toHaveBeenCalled();
  });
});
