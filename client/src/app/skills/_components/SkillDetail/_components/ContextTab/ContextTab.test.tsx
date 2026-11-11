import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocument, SkillListItem } from "@devdigest/shared";
import skills from "../../../../../../../messages/en/skills.json";
import contextJson from "../../../../../../../messages/en/context.json";
import { installFetch, calledRequests } from "@/test/fetch-router";

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const context = contextJson as unknown as AbstractIntlMessages; // json has an array (patterns)
const SKILL ={ id: "s1", name: "Edge Cases" } as SkillListItem;

const doc = (path: string): ContextDocument => ({
  path,
  name: path.split("/").pop()!,
  dir: "docs",
  type: "docs",
  size_bytes: 100,
  tokens: 50,
  too_large: false,
  used_by: { agents: 0, skills: 0 },
});

function setup(put: (init: RequestInit | undefined) => ReturnType<Parameters<typeof installFetch>[0]>) {
  const spy = installFetch((url, init) => {
    if (url === "/skills/s1/context" && init?.method === "PUT") return put(init);
    if (url === "/skills/s1/context") return { body: { paths: [{ path: "docs/a.md", order: 0 }] } };
    if (url === "/repos/r1/context") {
      return {
        body: {
          status: "ok",
          scanned_at: null,
          truncated: false,
          total_tokens: 0,
          documents: [doc("docs/a.md"), doc("docs/b.md")],
        },
      };
    }
    return undefined;
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills, context }}>
        <ContextTab skill={SKILL} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return spy;
}

describe("skill ContextTab — saving (AC-18, AC-21)", () => {
  it("shows the 'Project context to use' section and PUTs the full list with the new path appended", async () => {
    const spy = setup(() => ({ body: { paths: [{ path: "docs/a.md", order: 0 }, { path: "docs/b.md", order: 1 }] } }));
    expect(await screen.findByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/b.md" }));

    await waitFor(() => expect(calledRequests(spy)).toContain("PUT /skills/s1/context"));
    const put = spy.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT")!;
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ paths: ["docs/a.md", "docs/b.md"] });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "docs/b.md" })).toBeChecked());
  });
});

describe("skill ContextTab — subtitle (AC-89)", () => {
  it("shows the order-matters subtitle and not the old 'Attached documents are added…' line", async () => {
    setup(() => ({ body: { paths: [] } }));
    expect(await screen.findByText(/Order matters — earlier docs appear earlier/)).toBeInTheDocument();
    expect(screen.queryByText(/Attached documents are added/)).not.toBeInTheDocument();
  });
});

describe("skill ContextTab — failed save (AC-29)", () => {
  it("rolls the checkbox back to unchecked when the PUT fails", async () => {
    let fail!: () => void;
    const gate = new Promise<void>((resolve) => (fail = resolve));
    setup(async () => {
      await gate;
      return { status: 500, body: { error: { code: "internal", message: "boom" } } };
    });
    const box = await screen.findByRole("checkbox", { name: "docs/b.md" });
    fireEvent.click(box);
    // optimistic while the request is in flight
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "docs/b.md" })).toBeChecked());

    fail();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "docs/b.md" })).not.toBeChecked());
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeChecked();
  });
});
