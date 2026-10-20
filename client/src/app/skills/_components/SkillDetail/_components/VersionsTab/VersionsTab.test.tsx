import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem, SkillVersion } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const restore = { mutate: vi.fn(), isPending: false };
const VERSIONS: SkillVersion[] = [
  { skill_id: "s1", version: 2, body: "line a\nline B\n", created_at: "2026-10-17T10:00:00.000Z" },
  { skill_id: "s1", version: 1, body: "line a\nline b\n", created_at: "2026-10-16T10:00:00.000Z" },
];
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => restore,
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SKILL: SkillListItem = {
  id: "s1",
  name: "Edge Cases",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "line a\nline B\n",
  enabled: true,
  version: 2,
  agent_count: 0,
  created_at: "2026-10-17T10:00:00.000Z",
  updated_at: "2026-10-17T10:00:00.000Z",
};

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, common }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab (smoke)", () => {
  it("lists every version newest first; only older ones get Diff / Restore", () => {
    renderTab();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    const rows = screen.getAllByTestId("skill-version-row");
    expect(rows.map((r) => within(r).getByText(/^v\d$/).textContent)).toEqual(["v2", "v1"]);
    expect(within(rows[0]!).getByText("Current")).toBeInTheDocument();
    expect(within(rows[0]!).queryByText("Restore")).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText("Restore")).toBeInTheDocument();
  });
});

describe("VersionsTab — diff and restore", () => {
  it("Diff shows the changed lines against the current body", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    const diff = screen.getByTestId("skill-version-diff");
    expect(diff.querySelector('[data-diff="del"]')).toHaveTextContent("line b");
    expect(diff.querySelector('[data-diff="add"]')).toHaveTextContent("line B");
  });

  it("Restore asks first, then restores that version", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Restore v1");
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(restore.mutate).toHaveBeenCalledWith({ id: "s1", version: 1 }, expect.anything());
  });
});
