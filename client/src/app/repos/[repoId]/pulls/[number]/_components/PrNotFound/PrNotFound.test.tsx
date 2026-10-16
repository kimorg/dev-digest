import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { PrNotFound } from "./PrNotFound";

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("PrNotFound (smoke)", () => {
  it("explains the missing PR and links back to the repo's PR list", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PrNotFound repoId="r1" number="42" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Pull request not found")).toBeInTheDocument();
    expect(screen.getByText(/PR #42/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to pull requests"));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls");
  });
});
