import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import blast from "../../../../../../../../../../../../messages/en/blast.json";
import { PriorPrsBlock } from "./PriorPrsBlock";

function renderBlock(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast }}>
        <PriorPrsBlock prId="p1" repoFullName="acme/api" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TITLE = "Prior PRs touching these files";

describe("PriorPrsBlock — list", () => {
  it("is collapsed with a count; expanding shows linked PRs, author and overlapping files", async () => {
    renderBlock({
      history: [
        { pr_number: 41, title: "Add limiter", merged_at: "2026-03-01T10:00:00Z", author: "marisa", files_overlap: ["src/a.ts", "src/b.ts"], notes: "" },
        { pr_number: 40, title: "Tidy config", merged_at: "2026-02-01T10:00:00Z", author: "dev", files_overlap: ["src/a.ts"], notes: "" },
      ],
      degraded: false,
      reason: null,
    });
    expect(await screen.findByText("2")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: new RegExp(TITLE) });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Add limiter")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "#41" })).toHaveAttribute("href", "https://github.com/acme/api/pull/41");
    expect(screen.getByText("Add limiter")).toBeInTheDocument();
    expect(screen.getByText(/marisa/)).toBeInTheDocument();
    expect(screen.getByText("src/a.ts, src/b.ts")).toBeInTheDocument();
  });
});

describe("PriorPrsBlock — empty and degraded", () => {
  it("shows a 0 count and cannot be expanded when no prior PRs are found", async () => {
    renderBlock({ history: [], degraded: false, reason: null });
    expect(await screen.findByText("0")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: new RegExp(TITLE) });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toHaveAttribute("aria-expanded");
    fireEvent.click(toggle);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("explains a missing GitHub token without expanding, with a disabled 0-count header", async () => {
    renderBlock({ history: [], degraded: true, reason: "no_token" });
    expect(await screen.findByText(/Add a GitHub token/)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(TITLE) })).toBeDisabled();
  });

  it("shows a load error without expanding when the request fails and nothing is cached", async () => {
    renderBlock({ error: { message: "boom" } }, 500);
    expect(await screen.findByText("Couldn't load prior PRs.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(TITLE) })).toBeDisabled();
  });
});
