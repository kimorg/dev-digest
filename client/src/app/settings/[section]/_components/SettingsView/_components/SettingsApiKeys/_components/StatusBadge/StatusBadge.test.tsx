import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/settings.json";
import { StatusBadge } from "./StatusBadge";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
    {ui}
  </NextIntlClientProvider>
);

describe("StatusBadge (smoke)", () => {
  it("renders nothing while loading, then the configured state", () => {
    const { container, rerender } = render(wrap(<StatusBadge configured={undefined} />));
    expect(container).toBeEmptyDOMElement();
    rerender(wrap(<StatusBadge configured />));
    expect(screen.getByText("Configured")).toBeInTheDocument();
    rerender(wrap(<StatusBadge configured={false} />));
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });
});
