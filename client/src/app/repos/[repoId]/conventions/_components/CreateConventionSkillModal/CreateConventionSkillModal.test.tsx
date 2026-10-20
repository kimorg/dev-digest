import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillDraft } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "2 house conventions extracted from payments-api",
  type: "convention",
  body: "# repo-conventions\n\n## always-use-async-await\nAlways use async/await.",
  convention_count: 2,
  evidence_files: ["src/api/users.ts", "src/lib/redis.ts"],
};

const draft = { data: DRAFT as ConventionSkillDraft | undefined, isError: false, refetch: vi.fn() };
const create = { mutate: vi.fn(), isPending: false, error: null as unknown };
vi.mock("@/lib/hooks/conventions", () => ({ useConventionSkillDraft: () => draft }));
vi.mock("@/lib/hooks/skills", () => ({ useCreateSkill: () => create }));

import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  create.error = null;
});

function renderModal() {
  const props = { onClose: vi.fn(), onCreated: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <CreateConventionSkillModal repoId="r1" repoName="payments-api" {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("CreateConventionSkillModal (smoke)", () => {
  it("explains it merges accepted conventions and prefills the draft", () => {
    renderModal();
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "Merged from 2 accepted conventions in payments-api. Everything below is editable before you save.",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("repo-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue(DRAFT.description);
    expect(screen.getByRole("combobox")).toHaveValue("convention");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Skill body")).toHaveValue(DRAFT.body);
    expect(screen.getByText("repo-conventions.md")).toBeInTheDocument();
  });
});

describe("CreateConventionSkillModal — create", () => {
  it("sends the edited body and metadata as an extracted skill", () => {
    const props = renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " payments-conventions " } });
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# edited" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(create.mutate).toHaveBeenCalledWith(
      {
        name: "payments-conventions",
        description: DRAFT.description,
        type: "convention",
        body: "# edited",
        source: "extracted",
        enabled: false,
        evidence_files: DRAFT.evidence_files,
      },
      { onSuccess: props.onCreated },
    );
  });

  it("keeps Create disabled while a required field is blank; Cancel closes", () => {
    const props = renderModal();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows a taken name inline", () => {
    create.error = new ApiError("taken", 409, "skill_name_taken");
    renderModal();
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });
});
