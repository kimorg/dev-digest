import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/addRepo.json";
import { ApiError } from "@/lib/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const mutate = vi.fn();
let addState: Record<string, unknown> = { isPending: false, isError: false };
vi.mock("@/lib/hooks/repos", () => ({ useAddRepo: () => ({ mutate, ...addState }) }));

import { AddRepoView } from "./AddRepoView";

afterEach(() => {
  cleanup();
  push.mockClear();
  mutate.mockClear();
  addState = { isPending: false, isError: false };
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ addRepo: messages }}>
      <AddRepoView />
    </NextIntlClientProvider>,
  );
}

describe("AddRepoView (smoke)", () => {
  it("renders the texts the onboarding e2e flow waits on", () => {
    renderView();
    expect(screen.getByText("Add a repository")).toBeInTheDocument();
    expect(screen.getByText("Repository URL")).toBeInTheDocument();
    expect(screen.getByText("Settings → API Keys")).toHaveAttribute("href", "/settings/api-keys");
  });
});

describe("AddRepoView — submit", () => {
  it("adds the trimmed URL and opens the new repo's PR list on success", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "  https://github.com/acme/api  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add repository/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const [url, opts] = mutate.mock.calls[0]!;
    expect(url).toBe("https://github.com/acme/api");
    opts.onSuccess({ id: "r9" });
    expect(push).toHaveBeenCalledWith("/repos/r9/pulls");
  });

  it("shows the API error from the mutation", () => {
    addState = { isPending: false, isError: true, error: new ApiError("Repo not found on GitHub", 404) };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Repo not found on GitHub");
  });
});
