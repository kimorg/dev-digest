import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, SkillListItem } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import skills from "../../../../../../../../messages/en/skills.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const sk = (id: string, name: string, extra: Partial<SkillListItem> = {}): SkillListItem => ({
  id,
  name,
  description: "d",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  agent_count: 0,
  created_at: "2026-10-17T10:00:00.000Z",
  updated_at: "2026-10-17T10:00:00.000Z",
  ...extra,
});
const SKILLS = [
  sk("s-over", "Over-Mocking", { type: "convention" }),
  sk("s-edge", "Edge Case Checklist", { type: "rubric" }),
  sk("s-unc", "Uncovered Branches"),
  sk("s-sec", "Secret Leakage", { type: "security", enabled: false, created_at: "2026-10-18T09:00:00.000Z" }),
];
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "s-unc", order: 0 },
  { agent_id: "ag1", skill_id: "s-edge", order: 1 },
];
const setLinks = { mutate: vi.fn() };
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false }),
  useSetAgentSkills: () => setLinks,
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents, skills }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

const rowNames = () =>
  screen.getAllByTestId("agent-skill-row").map((r) => r.querySelector("span:nth-child(3)")?.textContent);

describe("SkillsTab (smoke)", () => {
  it("lists every skill: linked first in prompt order with #n, then the rest newest first", () => {
    renderTab();
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    expect(rowNames()).toEqual(["Uncovered Branches", "Edge Case Checklist", "Secret Leakage", "Over-Mocking"]);
    const rows = screen.getAllByTestId("agent-skill-row");
    expect(within(rows[0]!).getByText("#1")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("#2")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("convention")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("disabled — skipped at run time")).toBeInTheDocument();
  });

  it("only linked skills get a drag handle", () => {
    renderTab();
    expect(screen.getAllByTestId("agent-skill-drag-handle")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reorder “Uncovered Branches”" })).toBeEnabled();
  });
});

describe("SkillsTab — linking", () => {
  it("toggle on appends the skill; toggle off removes it — always the full ordered list", () => {
    renderTab();
    const rows = screen.getAllByTestId("agent-skill-row");
    fireEvent.click(within(rows[3]!).getByRole("switch"));
    expect(setLinks.mutate).toHaveBeenLastCalledWith(["s-unc", "s-edge", "s-over"]);
    fireEvent.click(within(rows[0]!).getByRole("switch"));
    expect(setLinks.mutate).toHaveBeenLastCalledWith(["s-edge"]);
  });

  it("filters by name and disables dragging while filtered", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "edge" } });
    expect(rowNames()).toEqual(["Edge Case Checklist"]);
    expect(screen.getByTestId("agent-skill-drag-handle")).toBeDisabled();
    expect(screen.getByText("Clear the filter to reorder skills.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "nope" } });
    expect(screen.getByText("No skills match “nope”.")).toBeInTheDocument();
  });
});
