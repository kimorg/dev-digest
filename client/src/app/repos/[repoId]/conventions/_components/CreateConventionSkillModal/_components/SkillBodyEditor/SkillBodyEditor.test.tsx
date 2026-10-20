import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import { SkillBodyEditor } from "./SkillBodyEditor";

afterEach(cleanup);

describe("SkillBodyEditor (smoke)", () => {
  it("numbers every line, shows the file name and tokens, and edits the body", () => {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ conventions }}>
        <SkillBodyEditor value={"# a\n\nb"} onChange={onChange} fileName="repo-conventions.md" label="Skill body" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("skill-body-gutter").textContent).toBe("123");
    expect(screen.getByText("repo-conventions.md")).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(screen.getByText("2 tokens")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# b" } });
    expect(onChange).toHaveBeenCalledWith("# b");
  });
});
