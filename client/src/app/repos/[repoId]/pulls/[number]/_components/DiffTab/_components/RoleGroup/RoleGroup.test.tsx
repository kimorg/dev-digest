import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { DiffAnnotationApi, DiffCommentApi } from "@/components/diff-viewer";
import type { PrFile } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../../../messages/en/shell.json";
import { RoleGroup } from "./RoleGroup";

afterEach(cleanup);

const COMMENTING: DiffCommentApi = {
  comments: [],
  canComment: false,
  showComments: false,
  posting: false,
  onSubmit: async () => undefined,
};
const ANNOTATIONS: DiffAnnotationApi = { forFile: () => [], show: true, flagLabel: "Has findings" };

// `big` alone is over the per-file limit and, with `small`, over the group limit.
const FILES: PrFile[] = [
  { path: "src/big.ts", additions: 250, deletions: 0, patch: "@@ -1,1 +1,1 @@\n+big-line" },
  { path: "src/small.ts", additions: 2, deletions: 0, patch: "@@ -1,1 +1,1 @@\n+small-line" },
];

function renderGroup(files: PrFile[], flaggedCount = 0) {
  const ui = (n: number) => (
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <RoleGroup role="core" files={files} flaggedCount={n} commenting={COMMENTING} annotations={ANNOTATIONS} />
    </NextIntlClientProvider>
  );
  const view = render(ui(flaggedCount));
  return (n: number) => view.rerender(ui(n));
}

describe("RoleGroup — expand all", () => {
  it("⇕ opens the group and every file, then collapses every file; a manual click opens one file", () => {
    renderGroup(FILES);
    // Core starts open at any size; inside it `big` (> 200 lines) starts collapsed, `small` open.
    expect(screen.getByRole("button", { name: /^Core/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.queryByText("big-line")).not.toBeInTheDocument();
    expect(screen.getByText("small-line")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand all files in Core" }));
    expect(screen.getByRole("button", { name: /^Core/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("big-line")).toBeInTheDocument();
    expect(screen.getByText("small-line")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all files in Core" }));
    expect(screen.queryByText("big-line")).not.toBeInTheDocument();
    expect(screen.queryByText("small-line")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /src\/small\.ts/ }));
    expect(screen.getByText("small-line")).toBeInTheDocument();
    expect(screen.queryByText("big-line")).not.toBeInTheDocument();
  });
});

describe("RoleGroup — header", () => {
  it("shows the findings counter only when it is above zero; an empty group cannot expand", () => {
    const rerender = renderGroup(FILES, 0);
    expect(screen.queryByLabelText(/have findings|has findings/)).not.toBeInTheDocument();
    rerender(2);
    expect(screen.getByLabelText("2 files have findings")).toBeInTheDocument();
    cleanup();

    renderGroup([]);
    expect(screen.getByText("0 files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Core/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Expand all files/ })).not.toBeInTheDocument();
  });
});
