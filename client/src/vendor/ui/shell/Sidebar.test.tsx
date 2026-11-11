import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

afterEach(cleanup);

describe("Sidebar — Project Context item (AC-1)", () => {
  it("shows 'Project Context' in the WORKSPACE group, linking to the active repo's context page", () => {
    render(<Sidebar ctx={{ repoId: "r1", activeKey: "pulls" }} />);
    const link = screen.getByRole("link", { name: /Project Context/ });
    expect(link).toHaveAttribute("href", "/repos/r1/context");

    // The link sits in the same group block as the WORKSPACE section label.
    const group = screen.getByText("WORKSPACE").parentElement as HTMLElement;
    expect(within(group).getByRole("link", { name: /Project Context/ })).toBe(link);
    expect(within(group).getByRole("link", { name: /Pull Requests/ })).toBeInTheDocument();
  });
});
