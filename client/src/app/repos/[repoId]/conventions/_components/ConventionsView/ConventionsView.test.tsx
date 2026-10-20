import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, RepoConventions } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";

const conv = {
  query: { data: undefined as RepoConventions | undefined, isLoading: false, isError: false, refetch: vi.fn() },
  extract: { mutate: vi.fn(), isPending: false },
  update: { mutate: vi.fn(), isPending: false, variables: undefined },
  setStatus: { mutate: vi.fn(), isPending: false },
};
vi.mock("@/lib/hooks/conventions", () => ({
  useRepoConventions: () => conv.query,
  useExtractConventions: () => conv.extract,
  useUpdateConvention: () => conv.update,
  useSetConventionsStatus: () => conv.setStatus,
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repos: [{ id: "r1", name: "payments-api", full_name: "acme/payments-api", default_branch: "main" }],
  }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../CreateConventionSkillModal", () => ({
  CreateConventionSkillModal: () => <div data-testid="create-skill-modal" />,
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  conv.query.data = undefined;
  conv.extract.isPending = false;
});

const candidate = (id: string, status: ConventionCandidate["status"]): ConventionCandidate => ({
  id,
  repo_id: "r1",
  rule: `Rule ${id}`,
  evidence_path: "src/a.ts",
  evidence_line_start: 1,
  evidence_line_end: 2,
  evidence_snippet: "await x();",
  confidence: 0.8,
  status,
  created_at: "2026-10-18T10:00:00.000Z",
  updated_at: "2026-10-18T10:00:00.000Z",
});

const SCAN: RepoConventions["scan"] = {
  id: "s1",
  repo_id: "r1",
  status: "done",
  model: "m",
  head_sha: "abc123",
  sample_files: ["tsconfig.json", "src/a.ts"],
  sample_count: 2,
  candidate_count: 2,
  dropped_count: 1,
  error: null,
  created_at: "2026-10-18T10:00:00.000Z",
};

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }} now={new Date("2026-10-18T11:00:00.000Z")}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView — first scan", () => {
  it("before any scan: Run Scan (header + empty state), no Re-scan", () => {
    conv.query.data = { scan: null, candidates: [] };
    renderView();
    expect(screen.getByRole("heading")).toHaveTextContent("Conventions in payments-api");
    expect(screen.queryByRole("button", { name: "Re-scan" })).not.toBeInTheDocument();
    const runs = screen.getAllByRole("button", { name: "Run Scan" });
    expect(runs).toHaveLength(2);
    fireEvent.click(runs[0]!);
    expect(conv.extract.mutate).toHaveBeenCalled();
  });

  it("while scanning shows progress", () => {
    conv.query.data = { scan: null, candidates: [] };
    conv.extract.isPending = true;
    renderView();
    expect(screen.getAllByText("Scanning…").length).toBeGreaterThan(0);
  });
});

describe("ConventionsView — after a scan", () => {
  it("shows Re-scan, the scan summary and the candidate cards; Create skill needs an accepted one", () => {
    conv.query.data = { scan: SCAN, candidates: [candidate("a", "pending"), candidate("b", "pending")] };
    renderView();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
    expect(screen.getByText("Detected from 2 sample files · last scan 1 hour ago")).toBeInTheDocument();
    expect(screen.getByText(/1 candidate dropped/)).toBeInTheDocument();
    expect(screen.getAllByTestId("convention-card-pending")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    expect(conv.update.mutate).toHaveBeenCalledWith({ id: "a", patch: { status: "rejected" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(conv.setStatus.mutate).toHaveBeenCalledWith({ ids: ["a", "b"], status: "accepted" });
  });

  it("Create skill opens the modal once a candidate is accepted", () => {
    conv.query.data = { scan: SCAN, candidates: [candidate("a", "accepted"), candidate("b", "pending")] };
    renderView();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByTestId("create-skill-modal")).toBeInTheDocument();
  });

  it("links evidence to GitHub at the scanned commit, falling back to the default branch", () => {
    conv.query.data = { scan: SCAN, candidates: [candidate("a", "pending")] };
    renderView();
    expect(screen.getByRole("link", { name: "src/a.ts:1-2" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/a.ts#L1-L2",
    );

    cleanup();
    conv.query.data = { scan: { ...SCAN, head_sha: null }, candidates: [candidate("a", "pending")] };
    renderView();
    expect(screen.getByRole("link", { name: "src/a.ts:1-2" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/main/src/a.ts#L1-L2",
    );
  });

  it("a failed last scan is shown", () => {
    conv.query.data = { scan: { ...SCAN, status: "failed", error: "OPENAI_API_KEY is not configured" }, candidates: [] };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Last scan failed: OPENAI_API_KEY is not configured");
  });
});
