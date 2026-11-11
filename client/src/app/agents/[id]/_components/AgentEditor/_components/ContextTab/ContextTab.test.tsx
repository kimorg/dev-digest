import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentContextResult, ContextDocument } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import contextJson from "../../../../../../../../messages/en/context.json";
import { installFetch, calledRequests } from "@/test/fetch-router";

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const context = contextJson as unknown as AbstractIntlMessages; // json has an array (patterns)
const AGENT ={ id: "a1", name: "Security" } as Agent;

const doc = (path: string, tokens: number): ContextDocument => ({
  path,
  name: path.split("/").pop()!,
  dir: path.split("/").slice(0, -1).join("/"),
  type: "docs",
  size_bytes: 100,
  tokens,
  too_large: false,
  used_by: { agents: 0, skills: 0 },
});

const entries = (...paths: string[]) => paths.map((path, order) => ({ path, order }));

function setup(attached: AgentContextResult, documents: ContextDocument[]) {
  const spy = installFetch((url) => {
    if (url === "/agents/a1/context?include=skills") return { body: attached };
    if (url === "/repos/r1/context") {
      return {
        body: { status: "ok", scanned_at: null, truncated: false, total_tokens: 0, documents },
      };
    }
    return undefined;
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents, context }}>
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return spy;
}

const viaLine = async () => (await screen.findByTestId("agent-context-via-skills")).textContent;

describe("agent ContextTab — via-skills line (AC-30)", () => {
  it("no skills → '+0 docs via skills · ~0 tokens' (shown at K = 0)", async () => {
    setup({ paths: entries("server/AGENTS.md"), skills: [] }, [doc("server/AGENTS.md", 300)]);
    expect(await viaLine()).toBe("+0 docs via skills · ~0 tokens");
  });

  it("a path shared with the agent is not counted (EC-4)", async () => {
    setup(
      { paths: entries("server/AGENTS.md"), skills: [{ skill_id: "s1", paths: entries("server/AGENTS.md") }] },
      [doc("server/AGENTS.md", 300)],
    );
    expect(await viaLine()).toBe("+0 docs via skills · ~0 tokens");
  });

  it("a path under two skills counts once: K = 1, T = 800 (EC-19)", async () => {
    setup(
      {
        paths: [],
        skills: [
          { skill_id: "s1", paths: entries("server/docs/auth.md") },
          { skill_id: "s2", paths: entries("server/docs/auth.md") },
        ],
      },
      [doc("server/docs/auth.md", 800)],
    );
    expect(await viaLine()).toBe("+1 docs via skills · ~800 tokens");
  });

  it("a deleted file counts in K but not in T (EC-20; locale formats 1 200 as 1,200)", async () => {
    setup(
      { paths: [], skills: [{ skill_id: "s1", paths: entries("server/docs/security.md", "server/docs/old-auth.md") }] },
      [doc("server/docs/security.md", 1200)],
    );
    expect(await viaLine()).toBe("+2 docs via skills · ~1,200 tokens");
  });
});

describe("agent ContextTab — subtitle (AC-89)", () => {
  it("shows the order-matters subtitle and not the old 'Attached documents are added…' line", async () => {
    setup({ paths: [], skills: [] }, []);
    expect(await screen.findByText(/Order matters — earlier docs appear earlier/)).toBeInTheDocument();
    expect(screen.queryByText(/Attached documents are added/)).not.toBeInTheDocument();
  });
});

describe("agent ContextTab — one attachment request (NFR-8)", () => {
  it.each([0, 1, 5])("with %i linked skills: exactly one ?include=skills GET, no /skills/:id/context GET", async (n) => {
    const skills = Array.from({ length: n }, (_, i) => ({
      skill_id: "s" + i,
      paths: entries("server/docs/d" + i + ".md"),
    }));
    const spy = setup({ paths: [], skills }, []);
    await viaLine();
    await screen.findByText(/of 0 attached/);

    const calls = calledRequests(spy);
    expect(calls.filter((c) => c === "GET /agents/a1/context?include=skills")).toHaveLength(1);
    expect(calls.filter((c) => /\/agents\/a1\/context/.test(c))).toHaveLength(1);
    expect(calls.filter((c) => /\/skills\/.+\/context/.test(c))).toHaveLength(0);
  });
});
