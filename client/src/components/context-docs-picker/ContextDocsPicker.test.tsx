import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocument, ContextListResult } from "@devdigest/shared";
import contextJson from "../../../messages/en/context.json";
import { installFetch } from "@/test/fetch-router";
import { ContextDocsPicker } from "./ContextDocsPicker";

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

const DOCS = [
  doc("docs/b.md", { tokens: 60 }),
  doc("server/AGENTS.md", { type: "readme", tokens: 100 }),
  doc("docs/a.md", { tokens: 50 }),
  doc("docs/huge.md", { tokens: 0, too_large: true, size_bytes: 500_000 }),
];

function route(documents: ContextDocument[]) {
  installFetch((url) => {
    if (url === "/repos/r1/context") {
      const body: ContextListResult = {
        status: "ok",
        scanned_at: "2026-10-18T10:00:00.000Z",
        truncated: false,
        total_tokens: 0,
        documents,
      };
      return { body };
    }
    if (url.startsWith("/repos/r1/context/file?path=")) {
      const path = decodeURIComponent(url.split("path=")[1]!);
      return { body: { path, type: "docs", size_bytes: 10, tokens: 5, content: "# Title of " + path } };
    }
    return undefined;
  });
}

function renderPicker(paths: string[], onChange = vi.fn(), documents = DOCS) {
  route(documents);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context }}>
        <ContextDocsPicker repoId="r1" paths={paths} onChange={onChange} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onChange;
}

const rowPaths = () =>
  screen.getAllByTestId("context-doc-row").map((r) => within(r).getByRole("checkbox").getAttribute("aria-label"));

describe("ContextDocsPicker (smoke)", () => {
  it("lists attached docs first in saved order, then the rest by path; header counts attached docs and tokens", async () => {
    renderPicker(["server/AGENTS.md", "docs/b.md"]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });

    expect(rowPaths()).toEqual(["server/AGENTS.md", "docs/b.md", "docs/a.md", "docs/huge.md"]);
    expect(screen.getByText("2 of 4 attached · ~160 tokens")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "server/AGENTS.md" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).not.toBeChecked();
    // AC-19: row shows name, folder, type badge and token count
    const row = screen.getAllByTestId("context-doc-row")[0]!;
    expect(within(row).getByText("AGENTS.md")).toBeInTheDocument();
    expect(within(row).getByText("server/")).toBeInTheDocument();
    expect(within(row).getByText("readme")).toBeInTheDocument();
    expect(within(row).getByText("100t")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("checking appends the path at the end of the saved list; unchecking removes it", async () => {
    const onChange = renderPicker(["server/AGENTS.md", "docs/b.md"]);
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/a.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["server/AGENTS.md", "docs/b.md", "docs/a.md"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "server/AGENTS.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["docs/b.md"]);
  });

  it("a file over the size limit cannot be attached (checkbox disabled)", async () => {
    renderPicker([]);
    expect(await screen.findByRole("checkbox", { name: "docs/huge.md" })).toBeDisabled();
    expect(screen.getByText("too large")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeEnabled();
  });

  it("an attached path missing from the repository shows a 'missing' badge, no tokens, and can be detached", async () => {
    const onChange = renderPicker(["gone.md", "docs/a.md"]);
    await screen.findByRole("checkbox", { name: "gone.md" });
    const row = screen.getAllByTestId("context-doc-row")[0]!;
    expect(within(row).getByText("missing")).toBeInTheDocument();
    expect(within(row).queryByText(/\dt$/)).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    // AC-96: the missing row has no type text
    expect(within(row).queryByText(/^(docs|specs|insights|plans|readme)$/)).not.toBeInTheDocument();
    // T counts only docs that exist (50 from docs/a.md)
    expect(screen.getByText(/~50 tokens/)).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(["docs/a.md"]);
  });
});

describe("ContextDocsPicker — drag handles and filter (AC-56, AC-24, AC-25, EC-13)", () => {
  it("only attached rows have a drag handle", async () => {
    renderPicker(["server/AGENTS.md", "docs/b.md"]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    const handles = screen.getAllByTestId("context-doc-drag-handle");
    expect(handles.map((h) => h.getAttribute("aria-label"))).toEqual([
      "Reorder server/AGENTS.md",
      "Reorder docs/b.md",
    ]);
    for (const h of handles) expect(h).toBeEnabled();
    const unattached = screen.getAllByTestId("context-doc-row").slice(2);
    for (const r of unattached) expect(within(r).queryByTestId("context-doc-drag-handle")).not.toBeInTheDocument();
  });

  it("filter is case-insensitive on the path and disables dragging while non-empty", async () => {
    renderPicker(["server/AGENTS.md", "docs/b.md"]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "AGENTS" } });
    expect(rowPaths()).toEqual(["server/AGENTS.md"]);
    for (const h of screen.getAllByTestId("context-doc-drag-handle")) expect(h).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "agents.MD" } });
    expect(rowPaths()).toEqual(["server/AGENTS.md"]);

    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "" } });
    expect(rowPaths()).toHaveLength(4);
    for (const h of screen.getAllByTestId("context-doc-drag-handle")) expect(h).toBeEnabled();
  });

  it("a filter that matches nothing shows 'No documents match the filter'", async () => {
    renderPicker([]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    fireEvent.change(screen.getByRole("textbox", { name: "Filter documents…" }), { target: { value: "zzz" } });
    expect(screen.getByText("No documents match the filter")).toBeInTheDocument();
    expect(screen.queryAllByTestId("context-doc-row")).toHaveLength(0);
  });
});

describe("ContextDocsPicker — preview panel (AC-26, NFR-6)", () => {
  it("opens a dialog with the path and rendered markdown; Esc closes it and focus returns to Preview", async () => {
    renderPicker([]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    const row = screen.getAllByTestId("context-doc-row")[0]!;
    const trigger = within(row).getByRole("button", { name: "Preview" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Preview of docs/a.md" });
    expect(within(dialog).getByText("docs/a.md")).toBeInTheDocument();
    expect(await within(dialog).findByRole("heading", { name: "Title of docs/a.md" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("the × button closes the panel too", async () => {
    renderPicker([]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    fireEvent.click(within(screen.getAllByTestId("context-doc-row")[0]!).getByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ContextDocsPicker — large context warning (AC-31)", () => {
  it("warns above 20 000 tokens, not at exactly 20 000", async () => {
    renderPicker(["docs/a.md"], vi.fn(), [doc("docs/a.md", { tokens: 20_001 })]);
    expect(await screen.findByText("Large context: ~20,001 tokens in every prompt")).toBeInTheDocument();
    cleanup();

    renderPicker(["docs/a.md"], vi.fn(), [doc("docs/a.md", { tokens: 20_000 })]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    expect(screen.queryByText(/Large context/)).not.toBeInTheDocument();
  });
});

describe("ContextDocsPicker — header layout (AC-88..91, AC-107)", () => {
  it("title, counts and filter share the header; subtitle has a code element; order header → subtitle → extra → warning → rows", async () => {
    route([doc("docs/a.md", { tokens: 20_001 })]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ context }}>
          <ContextDocsPicker repoId="r1" paths={["docs/a.md"]} onChange={vi.fn()} extra={<p>extra</p>} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    const header = await screen.findByTestId("context-picker-header");
    expect(within(header).getByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(within(header).getByText("1 of 1 attached · ~20,001 tokens")).toBeInTheDocument();
    expect(within(header).getByRole("textbox", { name: "Filter documents…" })).toBeInTheDocument();

    const code = screen.getByText("## Project context");
    expect(code.tagName).toBe("CODE");
    const subtitle = code.parentElement!;
    const extra = screen.getByText("extra");
    const warning = screen.getByText(/Large context/);
    const firstRow = screen.getAllByTestId("context-doc-row")[0]!;
    const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(header, subtitle)).toBe(true);
    expect(before(subtitle, extra)).toBe(true);
    expect(before(extra, warning)).toBe(true);
    expect(before(warning, firstRow)).toBe(true);
  });
});

describe("ContextDocsPicker — row layout (AC-92, AC-93, AC-96, AC-97)", () => {
  it("every row has a handle slot (empty when unattached), folder ends with '/', Preview starts with an eye icon", async () => {
    renderPicker(["server/AGENTS.md", "gone.md"]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    const rows = screen.getAllByTestId("context-doc-row");
    for (const r of rows) expect(within(r).getByTestId("context-doc-handle-slot")).toBeInTheDocument();
    const unattached = rows.filter((r) => r.getAttribute("data-attached") === "false");
    expect(unattached.length).toBeGreaterThan(0);
    for (const r of unattached) expect(within(r).getByTestId("context-doc-handle-slot")).toBeEmptyDOMElement();
    expect(within(rows[0]!).getByTestId("context-doc-handle-slot")).not.toBeEmptyDOMElement();

    const preview = within(rows[0]!).getByRole("button", { name: "Preview" });
    expect(preview.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(preview.firstElementChild).toHaveClass("lucide-eye");
  });
});

describe("ContextDocsPicker — preview panel keeps the list (AC-98, AC-100..102)", () => {
  it("opens beside the list; checkboxes still work; another Preview replaces the panel", async () => {
    const onChange = renderPicker([]);
    await screen.findByRole("checkbox", { name: "docs/a.md" });
    const previewOf = (path: string) =>
      within(screen.getAllByTestId("context-doc-row").find((r) => within(r).queryByRole("checkbox", { name: path }))!).getByRole(
        "button",
        { name: "Preview" },
      );

    fireEvent.click(previewOf("docs/a.md"));
    const dialog = await screen.findByRole("dialog", { name: "Preview of docs/a.md" });
    expect(screen.getByTestId("context-docs-picker")).toContainElement(dialog);
    expect(within(dialog).getByText("docs/a.md")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close preview" })).toBeInTheDocument();
    expect(screen.getAllByTestId("context-doc-row")).toHaveLength(4);

    fireEvent.click(screen.getByRole("checkbox", { name: "docs/b.md" }));
    expect(onChange).toHaveBeenLastCalledWith(["docs/b.md"]);

    fireEvent.click(previewOf("server/AGENTS.md"));
    expect(await screen.findByRole("dialog", { name: "Preview of server/AGENTS.md" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
