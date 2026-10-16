import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { SeverityCounts } from "./SeverityCounts";

afterEach(cleanup);

describe("SeverityCounts (smoke)", () => {
  it("shows one labelled, non-interactive count per severity present", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <SeverityCounts counts={{ critical: 2, warning: 0, suggestion: 1 }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("2 critical findings")).toBeInTheDocument();
    expect(screen.getByLabelText("1 suggestion finding")).toBeInTheDocument();
    expect(screen.queryByLabelText(/warning/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
