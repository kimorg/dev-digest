import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { Toaster } from "./Toaster";

afterEach(cleanup);

describe("Toaster (smoke)", () => {
  it("lists toasts in a live region and reports dismissals", () => {
    const onDismiss = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <Toaster items={[{ id: 7, kind: "error", message: "Boom" }]} onDismiss={onDismiss} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Boom");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});
