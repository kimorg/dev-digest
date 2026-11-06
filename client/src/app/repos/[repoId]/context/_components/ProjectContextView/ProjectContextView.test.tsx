import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocument, ContextListResult } from "@devdigest/shared";
import contextJson from "../../../../../../../messages/en/context.json";
import { installFetch, calledRequests } from "@/test/fetch-router";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repos: [{ id: "r1", name: "payments-api", full_name: "acme/payments-api", default_branch: "main" }],
  }),
  useRepoNotFound: () => false,
}));
const shell = vi.hoisted(() => ({ crumb: [] as { label: string; mono?: boolean }[] }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb: { label: string; mono?: boolean }[] }) => {
    shell.crumb = crumb;
    return <div>{children}</div>;
  },
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const context = contextJson as unknown as AbstractIntlMessages; // json has an array (patterns)
const doc = (path: string, extra: Partial<ContextDocument> = {}): ContextDocument => ({
  path,
  name: path.split("/").pop()!,
  dir: path.split("/").slice(0, -1).join("/"),
  type: "docs",
  size_bytes: 100,
  tokens: 50,
  too_large: false,
  used_by: { agents: 0, skills: 0 },
  ...extra,
});

const list = (documents: ContextDocument[], extra: Partial<ContextListResult> = {}): ContextListResult => ({
  status: "ok",
  scanned_at: "2026-10-18T10:00:00.000Z",
  truncated: false,
  total_tokens: documents.reduce((n, d) => n + d.tokens, 0),
  documents,
  ...extra,
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context }} now={new Date("2026-10-18T11:00:00.000Z")}>
        <ProjectContextView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectContextView — documents (smoke)", () => {
  // Deliberately unsorted from the API: the page must sort by path (AC-2).
  const DOCS = [
    doc("server/AGENTS.md", { type: "readme", tokens: 100, used_by: { agents: 2, skills: 3 } }),
    doc("docs/a.md", { tokens: 50 }),
  ];

  it("lists documents sorted by path; selecting one shows its path, rendered markdown, 'Used by' and the footer", async () => {
    installFetch((url) => {
      if (url === "/repos/r1/context") return { body: list(DOCS) };
      if (url.startsWith("/repos/r1/context/file?path=")) {
        return {
          body: {
            path: "server/AGENTS.md",
            type: "readme",
            size_bytes: 100,
            tokens: 100,
            content: "# Server rules\n\nBe **kind**.",
          },
        };
      }
      return undefined;
    });
    renderView();

    const items = await screen.findAllByRole("button", { name: /\.md/ });
    expect(items.map((b) => b.getAttribute("title"))).toEqual(["docs/a.md", "server/AGENTS.md"]);
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();

    fireEvent.click(items[1]!);
    const panel = await screen.findByRole("region", { name: "server/AGENTS.md" });
    expect(await within(panel).findByRole("heading", { name: "Server rules" })).toBeInTheDocument();
    expect(within(panel).getByText("Used by 2 agents · 3 skills")).toBeInTheDocument();

    expect(screen.getByText("2 documents · 150 tokens total · refreshed 1 hour ago")).toBeInTheDocument();
  });
});

describe("ProjectContextView — states", () => {
  it("a repository without a clone shows 'Repository is not cloned yet'", async () => {
    installFetch(() => ({ body: list([], { status: "no_clone", scanned_at: null }) }));
    renderView();
    expect(await screen.findByText("Repository is not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Documents" })).not.toBeInTheDocument();
  });

  it("a scan with no documents lists the patterns", async () => {
    installFetch(() => ({ body: list([]) }));
    renderView();
    expect(await screen.findByText("No documents found")).toBeInTheDocument();
    for (const pattern of contextJson.empty.patterns) expect(screen.getByText(pattern)).toBeInTheDocument();
  });

  it("a file that vanished after the scan (404) shows 'The file no longer exists — run Rescan'", async () => {
    installFetch((url) => {
      if (url === "/repos/r1/context") return { body: list([doc("docs/a.md")]) };
      if (url.startsWith("/repos/r1/context/file")) {
        return { status: 404, body: { error: { code: "context_doc_not_found", message: "gone" } } };
      }
      return undefined;
    });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: /a\.md/ }));
    expect(await screen.findByText("The file no longer exists — run Rescan")).toBeInTheDocument();
  });
});

describe("ProjectContextView — Rescan", () => {
  it("POSTs /rescan, is disabled (name unchanged) while pending, then shows the new list (AC-9, AC-71, AC-72)", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const spy = installFetch(async (url, init) => {
      if (url === "/repos/r1/context/rescan" && init?.method === "POST") {
        await gate;
        return { body: list([doc("docs/a.md"), doc("docs/new.md")]) };
      }
      if (url === "/repos/r1/context") return { body: list([doc("docs/a.md")]) };
      return undefined;
    });
    renderView();
    await screen.findByRole("button", { name: /a\.md/ });
    expect(screen.getByRole("button", { name: "Rescan" })).toHaveAccessibleDescription(
      "Rescan reads the local clone. Resync updates the clone from GitHub.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Rescan" })).toBeDisabled());

    finish();
    expect(await screen.findByRole("button", { name: /new\.md/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Rescan" })).toBeEnabled());
    expect(calledRequests(spy).filter((r) => r === "POST /repos/r1/context/rescan")).toHaveLength(1);
  });
});

const routeList = (result: ContextListResult, fileBody?: unknown) =>
  installFetch((url) => {
    if (url === "/repos/r1/context") return { body: result };
    if (url.startsWith("/repos/r1/context/file")) return { body: fileBody ?? {} };
    return undefined;
  });

describe("ProjectContextView — chrome (AC-66, AC-67)", () => {
  it("the breadcrumb is [repo full name (mono), 'Project Context']; the title bar holds only the h1", async () => {
    routeList(list([doc("docs/a.md")]));
    renderView();
    await screen.findByRole("button", { name: /a\.md/ });

    expect(shell.crumb).toEqual([{ label: "acme/payments-api", mono: true }, { label: "Project Context" }]);

    const bar = screen.getByTestId("context-title-bar");
    expect(within(bar).getAllByRole("heading")).toHaveLength(1);
    expect(within(bar).getByRole("heading", { level: 1, name: "Project Context" })).toBeInTheDocument();
    expect(within(bar).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/payments-api/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Markdown documents of the repository/)).not.toBeInTheDocument();
  });
});

describe("ProjectContextView — list rows (AC-74..77, EC-21)", () => {
  it("rows show only the full path (title = path), no type or tokens; the selected row is marked", async () => {
    routeList(
      list([doc("server/AGENTS.md", { type: "readme", tokens: 100 }), doc("docs/a.md")]),
      { path: "docs/a.md", type: "docs", size_bytes: 1, tokens: 1, content: "x" },
    );
    renderView();
    const rows = await screen.findAllByRole("button", { name: /\.md/ });
    expect(rows.map((b) => b.getAttribute("title"))).toEqual(["docs/a.md", "server/AGENTS.md"]);
    expect(rows.map((b) => b.textContent)).toEqual(["docs/a.md", "server/AGENTS.md"]);
    expect(rows[0]).toHaveAccessibleName("docs/a.md");
    const listEl = screen.getByRole("list", { name: "Documents" });
    expect(within(listEl).queryByText(/readme/)).not.toBeInTheDocument();
    expect(within(listEl).queryByText(/\d+t\b/)).not.toBeInTheDocument();

    fireEvent.click(rows[0]!);
    await waitFor(() => expect(rows[0]).toHaveAttribute("aria-current", "true"));
    expect(rows[0]!.getAttribute("style")).toContain("var(--accent-text)");
    expect(rows[1]).toHaveAttribute("aria-current", "false");
    expect(rows[1]!.getAttribute("style")).not.toContain("var(--accent-text)");
  });
});

describe("ProjectContextView — layout states (AC-82..85, GAP-1)", () => {
  it("truncated warning sits in the docs pane after the toolbar and before the list", async () => {
    routeList(list([doc("docs/a.md")], { truncated: true }));
    renderView();
    const warn = await screen.findByText(contextJson.page.truncated);
    const pane = screen.getByTestId("context-docs-pane");
    expect(pane).toContainElement(warn);
    const toolbar = within(pane).getByTestId("context-doc-toolbar");
    const listEl = within(pane).getByRole("list", { name: "Documents" });
    expect(toolbar.compareDocumentPosition(warn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warn.compareDocumentPosition(listEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no documents: patterns in the preview pane, Rescan still enabled in the docs pane, status bar shown", async () => {
    routeList(list([]));
    renderView();
    await screen.findByText("No documents found");
    const preview = screen.getByTestId("context-preview-pane");
    for (const p of contextJson.empty.patterns) expect(within(preview).getByText(p)).toBeInTheDocument();
    expect(within(screen.getByTestId("context-docs-pane")).getByRole("button", { name: "Rescan" })).toBeEnabled();
    expect(screen.getByTestId("context-status-bar")).toBeInTheDocument();
  });

  it.each([
    ["no clone", () => installFetch(() => ({ body: list([], { status: "no_clone", scanned_at: null }) })), "Repository is not cloned yet"],
    [
      "a 500 on the list",
      () => installFetch(() => ({ status: 500, body: { error: { code: "internal", message: "boom" } } })),
      contextJson.page.loadError,
    ],
  ])("%s: message only, no toolbar, status bar or Rescan", async (_n, install, text) => {
    install();
    renderView();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByTestId("context-doc-toolbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("context-status-bar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rescan" })).not.toBeInTheDocument();
  });

  it("while loading, the docs pane is busy with skeleton rows and the preview pane is present", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderView();
    expect(screen.getByTestId("context-docs-pane")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("context-doc-skeleton").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("context-preview-pane")).toBeInTheDocument();
  });
});
