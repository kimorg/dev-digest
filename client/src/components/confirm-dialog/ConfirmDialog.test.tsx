import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmDialog title="Delete skill" message="It will be removed." onConfirm={onConfirm} onCancel={onCancel} {...props} />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog (smoke)", () => {
  it("shows the title and message; Delete confirms", () => {
    const { onConfirm } = renderDialog();
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete skill");
    expect(screen.getByText("It will be removed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("ConfirmDialog — cancel paths", () => {
  it("Cancel, the × and Esc all cancel", () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it("while pending: buttons are disabled and Esc does nothing", () => {
    const { onCancel } = renderDialog({ isPending: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByTestId("confirm-dialog-confirm")).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
