import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PrCommit } from "@devdigest/shared";
import { CommitRow } from "./CommitRow";

afterEach(cleanup);

describe("CommitRow (smoke)", () => {
  it("shows the short sha, the subject line (full message on hover) and the author", () => {
    const commit = {
      sha: "0123456789abcdef",
      message: "Fix login bug\n\nDetails",
      author: "ana",
      committed_at: null,
    } as PrCommit;
    render(<CommitRow commit={commit} />);
    expect(screen.getByText("0123456")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toHaveAttribute("title", "Fix login bug\n\nDetails");
    expect(screen.getByText("ana")).toBeInTheDocument();
  });
});
