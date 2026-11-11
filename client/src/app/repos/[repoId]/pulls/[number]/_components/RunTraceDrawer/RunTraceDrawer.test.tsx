import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: '<skill name="Over-Mocking" version="1">\nDescription: Flag over-mocked tests.\n\n# Over-Mocking\n</skill>',
    memory: null,
    specs: null,
    user: "Review PR #482",
    tokens: { system: 5, skills: 12, memory: null, specs: null, callers: null, repo_map: null, pr_description: null, user: 4 },
  },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// Tests of project context swap the trace; reset to TRACE after each test.
let current: RunTrace = TRACE;
vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: current, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  current = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.060")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("Prompt assembly", () => {
  it("shows a token count only on the skills block and hides the skill name/description lines", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    const tokens = screen.getAllByTestId("prompt-block-tokens");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toHaveTextContent("~12 tok");

    fireEvent.click(screen.getByText("Skills (dynamic)"));
    expect(screen.getByText("# Over-Mocking")).toBeInTheDocument();
    expect(screen.queryByText(/Description: Flag over-mocked tests/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<skill name=/)).not.toBeInTheDocument();
  });
});

const wrap = (label: string, content: string) => `<untrusted source="${label}">\n${content}\n</untrusted>`;
const DOC_A = "# Server rules\nunique-line-alpha";
const DOC_B = "# Auth notes\nunique-line-beta";
const SPECS = [wrap("spec:server/AGENTS.md", DOC_A), wrap("spec:server/docs/auth.md", DOC_B)].join("\n\n");

function withSpecs(extra: Partial<RunTrace["prompt_assembly"]>, specsRead: string[]): RunTrace {
  return {
    ...TRACE,
    specs_read: specsRead,
    prompt_assembly: {
      ...TRACE.prompt_assembly,
      specs: SPECS,
      tokens: { ...TRACE.prompt_assembly.tokens!, specs: 321 },
      ...extra,
    },
  };
}

describe("Project context in the trace (AC-50…AC-53)", () => {
  it("'Specs read' lists the paths in order (AC-53)", () => {
    current = withSpecs({}, ["server/AGENTS.md", "server/docs/auth.md"]);
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const read = screen.getAllByText(/^server\/(AGENTS|docs\/auth)\.md$/).map((e) => e.textContent);
    expect(read).toEqual(["server/AGENTS.md", "server/docs/auth.md"]);
  });

  it("the block shows its tokens and the attached-specs list; opening one shows its full text (AC-50, AC-51)", () => {
    current = withSpecs(
      {
        spec_refs: [
          { path: "server/AGENTS.md", type: "readme", tokens: 120, source: "agent", skill_id: null },
          { path: "server/docs/auth.md", type: "docs", tokens: 201, source: "skill", skill_id: "s1" },
        ],
      },
      ["server/AGENTS.md", "server/docs/auth.md"],
    );
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getAllByTestId("prompt-block-tokens").map((e) => e.textContent)).toContain("~321 tok");

    fireEvent.click(screen.getByText("Project context (dynamic)"));
    const list = screen.getByRole("list", { name: "Project context attached specs" });
    const items = within(list).getAllByRole("button");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("server/AGENTS.md");
    expect(items[0]).toHaveTextContent("readme");
    expect(items[0]).toHaveTextContent("~120 tok");
    expect(items[1]).toHaveTextContent("server/docs/auth.md");
    expect(items[1]).toHaveTextContent("~201 tok");

    fireEvent.click(items[1]!);
    // the drawer is itself a dialog; the document modal is the last one opened
    const dialog = screen.getAllByRole("dialog").at(-1)!;
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("server/docs/auth.md")).toBeInTheDocument();
    expect(within(dialog).getByText(/# Auth notes\s+unique-line-beta/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/unique-line-alpha/)).not.toBeInTheDocument();
  });

  it("an older trace without spec_refs shows the block without the list and without an error (AC-52)", () => {
    current = withSpecs({ spec_refs: undefined }, ["server/AGENTS.md"]);
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    fireEvent.click(screen.getByText("Project context (dynamic)"));
    expect(screen.queryByRole("list", { name: "Project context attached specs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/unique-line-alpha/)).toBeInTheDocument();
  });
});
