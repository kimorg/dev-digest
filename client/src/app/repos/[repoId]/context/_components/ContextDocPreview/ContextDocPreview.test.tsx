import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocument } from "@devdigest/shared";
import contextJson from "../../../../../../../messages/en/context.json";
import { installFetch } from "@/test/fetch-router";
import { ContextDocPreview } from "./ContextDocPreview";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const context = contextJson as unknown as AbstractIntlMessages; // json has an array (patterns)
const DOC: ContextDocument = {
  path: "server/AGENTS.md",
  name: "AGENTS.md",
  dir: "server",
  type: "readme",
  size_bytes: 100,
  tokens: 20,
  too_large: false,
  used_by: { agents: 0, skills: 0 },
};

function renderPreview(doc: ContextDocument | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context }}>
        <ContextDocPreview repoId="r1" doc={doc} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ContextDocPreview — header and states (AC-78, AC-80, AC-86)", () => {
  it("no selection: only the placeholder, no header", () => {
    renderPreview(null);
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();
    expect(screen.queryByTestId("context-preview-header")).not.toBeInTheDocument();
  });

  it("selected doc: header holds the path and 'Used by', has no buttons; content renders below", async () => {
    installFetch(() => ({
      body: { path: DOC.path, type: "readme", size_bytes: 100, tokens: 20, content: "# Rules" },
    }));
    renderPreview(DOC);
    const header = screen.getByTestId("context-preview-header");
    expect(within(header).getByText("server/AGENTS.md")).toBeInTheDocument();
    expect(within(header).getByText("Used by 0 agents · 0 skills")).toBeInTheDocument();
    expect(within(header).queryAllByRole("button")).toHaveLength(0);
    expect(await screen.findByRole("heading", { name: "Rules" })).toBeInTheDocument();
  });

  it("404 context_doc_not_found: shows the 'run Rescan' message after the header", async () => {
    installFetch(() => ({ status: 404, body: { error: { code: "context_doc_not_found", message: "gone" } } }));
    renderPreview(DOC);
    const gone = await screen.findByText("The file no longer exists — run Rescan");
    const header = screen.getByTestId("context-preview-header");
    expect(header.compareDocumentPosition(gone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
