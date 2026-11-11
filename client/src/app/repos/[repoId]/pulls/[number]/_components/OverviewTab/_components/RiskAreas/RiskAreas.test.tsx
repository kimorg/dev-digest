import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, Risk } from "@devdigest/shared";
import brief from "../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 1, deletions: 0, patch: null },
  { path: "src/b.ts", additions: 1, deletions: 0, patch: null },
];
const fileHref = (path: string, line: number | null) =>
  `/repos/r1/pulls/7?tab=diff&file=${encodeURIComponent(path)}${line != null ? `&line=${line}` : ""}`;

function risk(title: string, severity: Risk["severity"], file_refs: string[], extra: Partial<Risk> = {}): Risk {
  return { kind: "other", title, explanation: `why ${title}`, severity, file_refs, ...extra };
}

const RISKS: Risk[] = [
  risk("Low one", "low", ["src/a.ts:1"]),
  risk("High one", "high", ["src/a.ts:12-18", "src/b.ts"], { explanation: "<script>x</script> bad" }),
  risk("Med one", "medium", ["src/gone.ts:4"]),
  risk("High two", "high", ["src/b.ts"]),
];

function renderRisks(risks: Risk[]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief }}>
      <RiskAreas risks={risks} files={FILES} fileHref={fileHref} />
    </NextIntlClientProvider>,
  );
}

describe("RiskAreas", () => {
  it("orders by severity keeping model order, and expands one risk at a time (AC-45, AC-46, AC-47, NFR-6)", () => {
    renderRisks(RISKS);
    const titles = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    const order = ["High one", "High two", "Med one", "Low one"].map((t) => titles.findIndex((x) => x.includes(t)));
    expect(order).toEqual([0, 1, 2, 3]);

    const first = screen.getByRole("button", { name: "Show details: High one" });
    const second = screen.getByRole("button", { name: "Show details: High two" });
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Risk details" })).not.toBeInTheDocument();

    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "Risk details" });
    // explanation is plain text, not HTML
    expect(within(panel).getByText("<script>x</script> bad")).toBeInTheDocument();
    expect(panel.querySelector("script")).toBeNull();
    expect(within(panel).getByRole("link", { name: "src/a.ts:12-18" })).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "src/b.ts" })).toBeInTheDocument();

    fireEvent.click(second);
    expect(screen.getByRole("button", { name: "Show details: High one" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("region", { name: "Risk details" })).toHaveLength(1);
    expect(screen.getByText("why High two")).toBeInTheDocument();
  });

  it("links to the diff at the first line of the range; a ref with no line has no line param (AC-48, AC-67)", () => {
    renderRisks(RISKS);
    fireEvent.click(screen.getByRole("button", { name: "Show details: High one" }));
    const panel = screen.getByRole("region", { name: "Risk details" });
    const ranged = within(panel).getByRole("link", { name: "src/a.ts:12-18" }).getAttribute("href")!;
    expect(ranged).toContain("tab=diff");
    expect(ranged).toContain("file=src%2Fa.ts");
    expect(ranged).toContain("line=12");
    const bare = within(panel).getByRole("link", { name: "src/b.ts" }).getAttribute("href")!;
    expect(bare).toContain("tab=diff");
    expect(bare).toContain("file=src%2Fb.ts");
    expect(bare).not.toContain("line");
  });

  it("a ref outside the diff reports it with role=status instead of navigating (AC-57)", () => {
    renderRisks(RISKS);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "src/gone.ts:4" }));
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");
  });

  it("shows 'No notable risks flagged.' when empty (AC-49)", () => {
    renderRisks([]);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});
