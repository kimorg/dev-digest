import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import type { DiffAnnotation, DiffAnnotationApi } from "../annotations";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/config.ts",
  additions: 2,
  deletions: 1,
  patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
};

const MARK = { color: "var(--crit)", icon: "AlertOctagon" as const, label: "blocker" };

function api(items: DiffAnnotation[], show = true): DiffAnnotationApi {
  return { forFile: () => items, show, flagLabel: "Has findings" };
}

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FileCard — annotations", () => {
  it("marks the line, shows the body under it and the dot; unplaced ones go to a footer block", () => {
    const items: DiffAnnotation[] = [
      { id: "a1", line: 3, mark: MARK, body: <p>on-line body</p> },
      { id: "a2", line: 99, mark: MARK, body: <p>unplaced body</p> },
    ];
    renderCard(<FileCard file={FILE} annotations={api(items)} />);
    expect(screen.getByRole("img", { name: "Has findings" })).toBeInTheDocument();
    const label = screen.getByText("blocker");
    // the row carries the coloured bar and the label is shown as given (not upper-cased)
    expect(label.parentElement).toHaveStyle({ boxShadow: "inset 3px 0 0 var(--crit)" });
    expect(label).toHaveStyle({ textTransform: "none" });
    expect(screen.getByText("on-line body")).toBeInTheDocument();
    expect(screen.getByText("unplaced body")).toBeInTheDocument();
    expect(screen.getByText("1 annotation outside the diff lines")).toBeInTheDocument();
  });

  it("show=false hides the bodies but keeps the dot and the label", () => {
    const items: DiffAnnotation[] = [
      { id: "a1", line: 3, mark: MARK, body: <p>on-line body</p> },
      { id: "a2", line: 99, mark: MARK, body: <p>unplaced body</p> },
    ];
    renderCard(<FileCard file={FILE} annotations={api(items, false)} />);
    expect(screen.queryByText("on-line body")).not.toBeInTheDocument();
    expect(screen.queryByText("unplaced body")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Has findings" })).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
  });

  it("an annotation without a mark adds no dot", () => {
    renderCard(<FileCard file={FILE} annotations={api([{ id: "a1", line: 3, mark: null, body: <p>muted</p> }])} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("muted")).toBeInTheDocument();
  });
});

describe("FileCard — controlled expansion", () => {
  it("open=false + click reports onOpenChange(true) while the body stays closed", () => {
    const onOpenChange = vi.fn();
    renderCard(<FileCard file={FILE} open={false} onOpenChange={onOpenChange} />);
    expect(screen.queryByText("const c = 4;")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /src\/config\.ts/ }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText("const c = 4;")).not.toBeInTheDocument();
  });

  it("uncontrolled: auto-expands a small file and toggles itself", () => {
    renderCard(<FileCard file={FILE} />);
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /src\/config\.ts/ }));
    expect(screen.queryByText("const c = 4;")).not.toBeInTheDocument();
  });
});
