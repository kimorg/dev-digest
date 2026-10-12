import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { formatCost, formatTokenTotal } from "@/lib/format-cost";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("formatCost", () => {
  it("renders '—' (never $0.00) when the cost is unknown", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });

  it("renders a genuine zero (free model) as $0", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("scales precision with magnitude", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.06)).toBe("$0.060");
    expect(formatCost(1.234)).toBe("$1.23");
  });
});

describe("formatTokenTotal", () => {
  it("sums in + out with thousands separators", () => {
    expect(formatTokenTotal(8_000, 1_119)).toBe("9,119");
  });

  it("returns null when there are no tokens", () => {
    expect(formatTokenTotal(null, null)).toBeNull();
    expect(formatTokenTotal(0, 0)).toBeNull();
  });
});

describe("RunCostBadge", () => {
  it("compact: cost only", () => {
    renderBadge(<RunCostBadge variant="compact" costUsd={0.012} tokensIn={100} tokensOut={50} />);
    expect(screen.getByTestId("run-cost-badge")).toHaveTextContent(/^\$0\.012$/);
  });

  it("compact: '—' without data", () => {
    renderBadge(<RunCostBadge variant="compact" costUsd={null} />);
    expect(screen.getByTestId("run-cost-badge")).toHaveTextContent(/^—$/);
  });

  it("detailed: tokens · cost", () => {
    renderBadge(<RunCostBadge variant="detailed" costUsd={0.0013} tokensIn={8_000} tokensOut={1_119} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("detailed: falls back to cost alone when tokens are missing", () => {
    renderBadge(<RunCostBadge variant="detailed" costUsd={0.02} />);
    expect(screen.getByTestId("run-cost-badge")).toHaveTextContent(/^\$0\.020$/);
  });
});
