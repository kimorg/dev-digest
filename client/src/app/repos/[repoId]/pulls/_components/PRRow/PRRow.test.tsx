import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../messages/en/common.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: () => ({ data: undefined, isLoading: false }) }));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
});

const PR = {
  id: "p1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "ana",
  additions: 10,
  deletions: 5,
  status: "needs_review",
  score: null,
  findings_counts: null,
  cost_usd: null,
  updated_at: null,
  head_sha: "abc",
} as unknown as PrMeta;

function renderRow() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
      <PRRow pr={PR} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — navigation", () => {
  it("the title is a real link to the PR detail (keyboard + new-tab friendly)", () => {
    renderRow();
    expect(screen.getByRole("link", { name: PR.title })).toHaveAttribute("href", "/repos/r1/pulls/482");
  });

  it("clicking elsewhere on the row navigates too; the link doesn't double-push", () => {
    renderRow();
    fireEvent.click(screen.getByText("ana"));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482");
    push.mockClear();
    const link = screen.getByRole("link", { name: PR.title });
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom can't navigate
    fireEvent.click(link);
    expect(push).not.toHaveBeenCalled();
  });
});
