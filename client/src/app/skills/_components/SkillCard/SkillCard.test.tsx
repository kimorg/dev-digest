import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: SkillListItem = {
  id: "s1",
  name: "Uncovered Branches",
  description: "Flag every new branch that no test covers.",
  type: "custom",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 3,
  agent_count: 2,
  created_at: "2026-10-17T10:00:00.000Z",
  updated_at: "2026-10-17T10:00:00.000Z",
};

function renderCard(props: Partial<React.ComponentProps<typeof SkillCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <SkillCard skill={SKILL} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("shows name, type, description, source · version and the agent count", () => {
    renderCard();
    expect(screen.getByText("Uncovered Branches")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getByText("Flag every new branch that no test covers.")).toBeInTheDocument();
    expect(screen.getByText("Manual · v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("marks a disabled imported skill", () => {
    renderCard({ skill: { ...SKILL, enabled: false, source: "imported_file", agent_count: 1 } });
    expect(screen.getByText(/Imported \(file\) · v3/)).toBeInTheDocument();
    expect(screen.getByText(/Disabled/)).toBeInTheDocument();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
  });
});

describe("SkillCard — actions", () => {
  it("toggle and delete fire their own callbacks without selecting the card", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    renderCard({ onSelect, onToggle, onDelete });

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete “Uncovered Branches”" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Uncovered Branches"));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
