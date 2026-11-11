import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewFocusItem } from "@devdigest/shared";
import brief from "../../../../../../../../../../messages/en/brief.json";
import { ReviewFocusCard } from "./ReviewFocusCard";

afterEach(cleanup);

const FILES: PrFile[] = [
  { path: "src/config.ts", additions: 1, deletions: 0, patch: null },
  { path: "src/api.ts", additions: 1, deletions: 0, patch: null },
];
const fileHref = (path: string, line: number | null) =>
  `/repos/r1/pulls/7?tab=diff&file=${encodeURIComponent(path)}${line != null ? `&line=${line}` : ""}`;

const ITEMS: ReviewFocusItem[] = [
  { file: "src/config.ts", line: 12, reason: "new default" },
  { file: "src/api.ts", line: 3, reason: "<b>auth</b> check" },
  { file: "src/other.ts", line: 5, reason: "only in blast map" },
  { file: "src/api.ts", line: 40, reason: "fourth" },
];

function renderCard(items: ReviewFocusItem[]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief }}>
      <ReviewFocusCard items={items} files={FILES} fileHref={fileHref} />
    </NextIntlClientProvider>,
  );
}

describe("ReviewFocusCard", () => {
  it("shows the count, rows in model order, diff links, and a status note for a file outside the diff (AC-50, AC-52, AC-57)", () => {
    renderCard(ITEMS);
    const card = screen.getByRole("region", { name: "Review focus — read these first" });
    expect(within(card).getByText("4")).toBeInTheDocument();

    const rows = within(card).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toBe("▸src/config.ts:12 — new default");
    expect(rows[3]).toBe("▸src/api.ts:40 — fourth");

    const link = within(card).getByRole("link", { name: "src/config.ts:12" });
    expect(link.getAttribute("href")).toContain("line=12");
    expect(link.getAttribute("href")).toContain("tab=diff");
    // reason is plain text
    expect(within(card).getByText(/<b>auth<\/b> check/)).toBeInTheDocument();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "src/other.ts:5" }));
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");
  });

  it("says 'No focus points.' when empty (AC-51)", () => {
    renderCard([]);
    expect(screen.getByText("No focus points.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
