import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";

vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ConventionCard } from "./ConventionCard";
import { confidenceColor, evidenceLocation } from "./helpers";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
  created_at: "2026-10-18T10:00:00.000Z",
  updated_at: "2026-10-18T10:00:00.000Z",
};

function renderCard(candidate: ConventionCandidate = CANDIDATE, evidenceUrl?: string) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ConventionCard candidate={candidate} evidenceUrl={evidenceUrl} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

describe("ConventionCard (smoke)", () => {
  it("shows the rule, the evidence file:lines, the snippet and the confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.queryByText("Async")).not.toBeInTheDocument();
  });
});

describe("ConventionCard — evidence link", () => {
  it("links the file:lines to GitHub in a new tab when a URL is given", () => {
    const url = "https://github.com/acme/api/blob/abc123/src/api/users.ts#L23-L31";
    renderCard(CANDIDATE, url);
    const link = screen.getByRole("link", { name: "src/api/users.ts:23-31" });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows plain text without a URL", () => {
    renderCard();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
  });
});

describe("ConventionCard — actions", () => {
  it("Accept, Reject and an accepted card's toggle back", () => {
    const { onChange } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onChange).toHaveBeenLastCalledWith({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onChange).toHaveBeenLastCalledWith({ status: "rejected" });

    cleanup();
    const accepted = renderCard({ ...CANDIDATE, status: "accepted" });
    const button = screen.getByRole("button", { name: "Accepted" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(accepted.onChange).toHaveBeenLastCalledWith({ status: "pending" });
  });

  it("Edit turns the rule into an inline textarea and saves the trimmed rule", () => {
    const { onChange } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const rule = screen.getByRole("textbox");
    expect(rule).toHaveValue(CANDIDATE.rule);
    fireEvent.change(rule, { target: { value: "  Prefer async/await  " } });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledWith({ rule: "Prefer async/await" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("Cancel leaves the candidate untouched", () => {
    const { onChange } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});

describe("ConventionCard — helpers", () => {
  it("colours confidence and formats the location", () => {
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.78)).toBe("var(--warn)");
    expect(confidenceColor(0.4)).toBe("var(--crit)");
    expect(evidenceLocation({ ...CANDIDATE, evidence_line_end: 23 })).toBe("src/api/users.ts:23");
  });
});
