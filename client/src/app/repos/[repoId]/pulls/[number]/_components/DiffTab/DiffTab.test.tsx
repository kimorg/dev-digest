import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse, SmartDiffRole } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

const PATCH = "@@ -1,2 +1,3 @@\n const a = 1;\n+const b = 3;\n+const c = 4;";

const USERS: PrFile = { path: "src/api/users.ts", additions: 2, deletions: 0, patch: PATCH };
const README: PrFile = { path: "README.md", additions: 3, deletions: 1, patch: PATCH };
// patch = null (as in the seed): its findings land in the "outside the diff lines" block.
const CONFIG: PrFile = { path: "src/config.ts", additions: 4, deletions: 0, patch: null };
const LOCK: PrFile = { path: "yarn.lock", additions: 5, deletions: 5, patch: PATCH };
const FILES = [USERS, README, CONFIG, LOCK];

function finding(id: string, file: string, startLine: number, extra: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "CRITICAL",
    category: "security",
    title: `Title ${id}`,
    file,
    start_line: startLine,
    end_line: startLine,
    rationale: `Rationale ${id}`,
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...extra,
  };
}

function review(findings: FindingRecord[]): ReviewRecord {
  return {
    id: "r1",
    pr_id: "p1",
    agent_id: "a1",
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-10-28T10:00:00.000Z",
    findings,
  };
}

function smartDiff(groups: Partial<Record<SmartDiffRole, PrFile[]>>): SmartDiffResponse {
  const roles: SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];
  return {
    groups: roles.map((role) => ({
      role,
      files: (groups[role] ?? []).map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, finding_lines: [] })),
    })),
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
  };
}

const GH_COMMENT = {
  id: 7,
  path: "src/api/users.ts",
  line: 2,
  original_line: 2,
  side: "RIGHT",
  body: "GitHub thread body",
  user: "octo",
  created_at: "2026-10-28T09:00:00.000Z",
  html_url: "https://github.com/x",
  in_reply_to_id: null,
  is_outdated: false,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface Setup {
  smart?: SmartDiffResponse | "error";
  reviews?: ReviewRecord[];
  comments?: unknown[];
  files?: PrFile[];
}

function renderTab({ smart = smartDiff({ core: [USERS, CONFIG], docs: [README], boilerplate: [LOCK] }), reviews = [], comments = [], files = FILES }: Setup = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/smart-diff")) return smart === "error" ? json({ error: { message: "boom" } }, 500) : json(smart);
      if (u.endsWith("/reviews")) return json(reviews);
      if (u.endsWith("/comments")) return json(comments);
      return json([]);
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="p1" filesCount={files.length} files={files} canComment />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DiffTab — smart order", () => {
  it("shows all five groups in order with counters per file, collapsed docs and an N files summary", async () => {
    // two findings in one file → the counter says 1 file, not 2 findings
    renderTab({ reviews: [review([finding("f1", "src/config.ts", 12), finding("f2", "src/config.ts", 20)])] });

    const core = await screen.findByRole("button", { name: /^Core/ });
    const labels = screen.getAllByText(/^(Core|Tests|Wiring|Docs|Boilerplate)$/).map((e) => e.textContent);
    expect(labels).toEqual(["Core", "Tests", "Wiring", "Docs", "Boilerplate"]);

    expect(core).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Docs/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^Boilerplate/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("0 files")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Tests/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Expand all files in Tests" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all files in Docs" })).toBeInTheDocument();

    expect(await screen.findByLabelText("1 file has findings")).toHaveTextContent("1");
    expect(screen.getByText(/4 files/, { selector: "div" })).toHaveTextContent("4 files · +14 −6");
    // findings are visible by default
    expect(screen.getByText("Title f1")).toBeInTheDocument();
    expect(screen.getByText("Title f2")).toBeInTheDocument();
    expect(screen.getByText("2 findings outside the diff lines")).toBeInTheDocument();
  });

  it("starts a core group over the line limit open", async () => {
    const big: PrFile = { path: "src/big.ts", additions: 150, deletions: 60, patch: PATCH };
    renderTab({ smart: smartDiff({ core: [big, USERS] }), files: [big, USERS] });
    expect(await screen.findByRole("button", { name: /^Core/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("falls back to a flat list with a note when grouping fails", async () => {
    renderTab({ smart: "error" });
    expect(await screen.findByText(/Couldn't group the files by role/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Core/ })).not.toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts")).toBeInTheDocument();
  });

  it("says no review has run when there are no reviews", async () => {
    renderTab();
    expect(await screen.findByText(/No review has run for this PR yet/)).toBeInTheDocument();
  });
});

describe("DiffTab — original order", () => {
  it("lists the files in pr.files order, without role groups", async () => {
    renderTab();
    await screen.findByRole("button", { name: /^Core/ });
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryByRole("button", { name: /^Core/ })).not.toBeInTheDocument();
    const paths = screen.getAllByText(/^(src\/api\/users\.ts|README\.md|src\/config\.ts|yarn\.lock)$/).map((e) => e.textContent);
    expect(paths).toEqual(["src/api/users.ts", "README.md", "src/config.ts", "yarn.lock"]);
    expect(screen.getByText(/4 files/, { selector: "div" })).toBeInTheDocument();
  });
});

describe("DiffTab — comments and findings visibility", () => {
  it("the Show/Hide button flips GitHub threads and findings together; findings are visible first", async () => {
    renderTab({
      reviews: [review([finding("f1", "src/api/users.ts", 3)])],
      comments: [GH_COMMENT],
    });
    expect(await screen.findByText("Title f1")).toBeInTheDocument();
    expect(screen.queryByText("GitHub thread body")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show comments (1)" }));
    expect(screen.getByText("GitHub thread body")).toBeInTheDocument();
    expect(screen.getByText("Title f1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide comments (1)" }));
    expect(screen.queryByText("GitHub thread body")).not.toBeInTheDocument();
    expect(screen.queryByText("Title f1")).not.toBeInTheDocument();
    // the bar label and the file dot stay
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Has findings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show comments (1)" }));
    expect(screen.getByText("Title f1")).toBeInTheDocument();
  });

  it("without GitHub comments there is no button and findings are visible", async () => {
    renderTab({ reviews: [review([finding("f1", "src/api/users.ts", 3)])] });
    expect(await screen.findByText("Title f1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /comments/i })).not.toBeInTheDocument();
  });

  it("a dismissed finding keeps its card but draws no bar and no dot", async () => {
    renderTab({
      reviews: [review([finding("f1", "src/api/users.ts", 3, { dismissed_at: "2026-10-28T11:00:00.000Z" })])],
    });
    expect(await screen.findByText("Title f1")).toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Has findings" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/have findings|has findings/)).not.toBeInTheDocument();
  });
});
