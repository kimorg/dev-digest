import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, PrFile } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import { installFetch } from "@/test/fetch-router";
import { OverviewTab } from "./OverviewTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FILES: PrFile[] = [{ path: "src/a.ts", additions: 1, deletions: 0, patch: null }];
const fileHref = (path: string, line: number | null) => `/x?tab=diff&file=${path}${line ? `&line=${line}` : ""}`;

const BLAST = { changed_symbols: [], downstream: [], summary: "s", degraded: false, reason: null, caller_facts: [] };

const RECORD: PrBriefRecord = {
  intent: null,
  blast: BLAST,
  risks: { risks: [{ kind: "other", title: "Risky thing", explanation: "e", severity: "high", file_refs: ["src/a.ts:1"] }] },
  history: null,
  summary: "Brief summary text.",
  review_focus: [{ file: "src/a.ts", line: 1, reason: "start here" }],
  head_sha: "abc",
  generated_at: "2026-11-10T10:00:00.000Z",
  provider: "openai",
  model: "gpt-4.1",
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
};

function renderTab(storedBrief: PrBriefRecord | null) {
  installFetch((url) => {
    if (url.endsWith("/brief")) return { body: { brief: storedBrief, stale: false } };
    if (url.endsWith("/reviews")) return { body: [] };
    if (url.endsWith("/intent"))
      return {
        body: {
          intent: {
            pr_id: "p1",
            intent: "Do the thing",
            in_scope: ["a"],
            out_of_scope: ["b"],
            confidence: "high",
            sources: [],
            provider: null,
            model: null,
            generated_at: "2026-11-10T10:00:00.000Z",
          },
          stale: false,
        },
      };
    if (url.endsWith("/blast")) return { body: BLAST };
    if (url.endsWith("/history")) return { body: { history: [], degraded: false, reason: null } };
    return undefined;
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ blast, brief, prReview }}>
        <OverviewTab
          prId="p1"
          repoId="r1"
          prBody="The PR description body"
          repoFullName="acme/api"
          headSha="abc"
          files={FILES}
          fileHref={fileHref}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("OverviewTab — layout order", () => {
  it("with a brief: banner, Intent / Blast radius, Review focus, Description; Risk areas inside Intent (AC-60, AC-61)", async () => {
    renderTab(RECORD);
    const banner = screen.getByRole("region", { name: "PR brief" });
    const intent = await screen.findByRole("region", { name: "Intent" });
    const blastCard = await screen.findByRole("region", { name: "Blast radius" });
    const focus = await screen.findByRole("region", { name: "Review focus — read these first" });
    const description = screen.getByText("The PR description body");

    expect(follows(banner, intent)).toBe(true);
    expect(follows(intent, blastCard)).toBe(true);
    expect(follows(blastCard, focus)).toBe(true);
    expect(follows(focus, description)).toBe(true);

    const risks = within(intent).getByRole("heading", { name: "Risk areas" });
    expect(within(intent).getByText("Risky thing")).toBeInTheDocument();
    // last block, after a horizontal rule
    const rule = intent.querySelector("hr")!;
    expect(follows(rule, risks)).toBe(true);
    expect(within(blastCard).queryByText("Risk areas")).not.toBeInTheDocument();
  });

  it("with no brief: Risk areas and Review focus are hidden, Intent and Blast radius stay (AC-32)", async () => {
    renderTab(null);
    expect(await screen.findByText("Brief not available yet.")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Intent" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Blast radius" })).toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Review focus — read these first" })).not.toBeInTheDocument();
    expect(screen.getByText("The PR description body")).toBeInTheDocument();
  });

  it("PR brief, Intent and Blast radius are labelled above their cards, like Description", async () => {
    renderTab(RECORD);
    for (const name of ["PR brief", "Intent", "Blast radius"]) {
      const card = await screen.findByRole("region", { name });
      const label = screen.getByText(name);
      expect(card.contains(label)).toBe(false);
      expect(follows(label, card)).toBe(true);
      // Label + card own one wrapper — a bare label would be a separate item of the tab's flex column (extra gap).
      const wrapper = card.parentElement!;
      expect(label.parentElement?.parentElement).toBe(wrapper);
      expect(wrapper.children).toHaveLength(2);
    }
  });
});
