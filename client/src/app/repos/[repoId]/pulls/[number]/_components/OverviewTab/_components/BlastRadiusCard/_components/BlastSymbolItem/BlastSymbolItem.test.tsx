import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import blast from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastSymbolItem } from "./BlastSymbolItem";

const IMPACT = {
  symbol: "run",
  callers: [{ name: "main", file: "src/a.ts", line: 7 }],
  endpoints_affected: [],
  crons_affected: [],
};

function renderItem(props: Partial<React.ComponentProps<typeof BlastSymbolItem>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <BlastSymbolItem impact={IMPACT} kind="method" repoFullName="acme/api" headSha="abc" {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

// jsdom puts a space at each <wbr> in the accessible name (browsers do not), so compare without whitespace.
const pathName = (path: string) => (name: string) => name.replace(/\s+/g, "") === path;

describe("BlastSymbolItem — toggle", () => {
  it("toggles aria-expanded, uses the singular caller count and links to the head sha", () => {
    renderItem({ defaultOpen: true });
    const toggle = screen.getByRole("button", { name: /run\(\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("1 caller")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: pathName("src/a.ts:7") })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/abc/src/a.ts#L7",
    );
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/a.ts:7")).not.toBeInTheDocument();
  });

  it("renders no link while the repo name or head sha is unknown", () => {
    renderItem({ defaultOpen: true, headSha: undefined });
    expect(screen.getByText("src/a.ts:7")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
