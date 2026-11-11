import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn() }),
}));
// Tab bodies are not under test here — only which tabs exist and that the Context one is wired.
vi.mock("./_components/ConfigTab", () => ({ ConfigTab: () => <div>config-body</div> }));
vi.mock("./_components/PreviewTab", () => ({ PreviewTab: () => <div>preview-body</div> }));
vi.mock("./_components/VersionsTab", () => ({ VersionsTab: () => <div>versions-body</div> }));
vi.mock("./_components/ContextTab", () => ({ ContextTab: () => <div>context-body</div> }));

import { SkillDetail } from "./SkillDetail";

afterEach(cleanup);

const SKILL: SkillListItem = {
  id: "s1",
  name: "Edge Cases",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 2,
  agent_count: 0,
  created_at: "2026-10-17T10:00:00.000Z",
  updated_at: "2026-10-17T10:00:00.000Z",
};

function renderDetail(tab: string, onTab = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <SkillDetail skill={SKILL} tab={tab} onTab={onTab} />
    </NextIntlClientProvider>,
  );
  return onTab;
}

describe("SkillDetail — tabs (AC-18)", () => {
  it("lists Config, Preview, Versions, Context in that order (Context after Versions)", () => {
    renderDetail("config");
    const names = ["Config", "Preview", "Versions", "Context"];
    const tabs = screen.getAllByRole("button").filter((b) => names.includes(b.textContent ?? ""));
    expect(tabs.map((b) => b.textContent)).toEqual(names);
  });

  it("clicking Context selects the tab; the Context tab renders its body", () => {
    const onTab = renderDetail("config");
    fireEvent.click(screen.getByRole("button", { name: "Context" }));
    expect(onTab).toHaveBeenCalledWith("context");
    cleanup();
    renderDetail("context");
    expect(screen.getByText("context-body")).toBeInTheDocument();
    expect(screen.queryByText("config-body")).not.toBeInTheDocument();
  });
});
