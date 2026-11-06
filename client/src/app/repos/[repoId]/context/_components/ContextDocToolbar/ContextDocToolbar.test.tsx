import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocument } from "@devdigest/shared";
import contextJson from "../../../../../../../messages/en/context.json";
import { installFetch } from "@/test/fetch-router";
import { ContextDocToolbar } from "./ContextDocToolbar";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const context = contextJson as unknown as AbstractIntlMessages; // json has an array (patterns)
const HINT = "Rescan reads the local clone. Resync updates the clone from GitHub.";
const CONTENT = "# Rules\n\nline two";
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

function renderToolbar(props: { selected?: ContextDocument | null; isRescanning?: boolean; onRescan?: () => void } = {}) {
  installFetch(() => ({ body: { path: DOC.path, type: "readme", size_bytes: 100, tokens: 20, content: CONTENT } }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context }}>
        <ContextDocToolbar
          repoId="r1"
          selected={props.selected === undefined ? null : props.selected}
          isRescanning={props.isRescanning ?? false}
          onRescan={props.onRescan ?? vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return screen.getByTestId("context-doc-toolbar");
}

describe("ContextDocToolbar — buttons (AC-70, AC-71, AC-73)", () => {
  it("holds Download then Rescan; Download has a title; Download is disabled without a selection and enabled once the file is loaded", async () => {
    const bar = renderToolbar();
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Download", "Rescan"]);
    expect(buttons[0]).toHaveAttribute("title", "Download");
    expect(buttons[0]).toBeDisabled();
    cleanup();

    const bar2 = renderToolbar({ selected: DOC });
    const download = within(bar2).getByRole("button", { name: "Download" });
    await waitFor(() => expect(download).toBeEnabled());
  });
});

describe("ContextDocToolbar — Rescan tooltip (AC-8, AC-72)", () => {
  it("the hint is the Rescan button's description and shows on hover or focus, hides on leave", () => {
    renderToolbar();
    const rescan = screen.getByRole("button", { name: "Rescan" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(rescan).toHaveAccessibleDescription(HINT);

    fireEvent.mouseEnter(rescan);
    expect(screen.getByRole("tooltip")).toHaveTextContent(HINT);
    fireEvent.mouseLeave(rescan);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(rescan);
    expect(screen.getByRole("tooltip")).toHaveTextContent(HINT);
    fireEvent.blur(rescan);
    expect(screen.queryByRole("tooltip")).toBeNull();

    // AC-8: the hint exists once, not also as visible text
    expect(screen.getAllByText(HINT, { ignore: "" })).toHaveLength(1);
  });
});

describe("ContextDocToolbar — Download (AC-10, EC-25)", () => {
  it("saves '<basename>' with the file's content, also while a rescan is running", async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      created.push(b as Blob);
      return "blob:fake";
    });
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    const bar = renderToolbar({ selected: DOC, isRescanning: true });
    const download = within(bar).getByRole("button", { name: "Download" });
    await waitFor(() => expect(download).toBeEnabled());
    fireEvent.click(download);

    expect(downloads).toEqual(["AGENTS.md"]);
    expect(created).toHaveLength(1);
    const read = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(created[0]!);
    });
    expect(read).toBe(CONTENT);
  });
});
