import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import blast from "../../../../../../../../../../../../messages/en/blast.json";
import { BlastGraphModal } from "./BlastGraphModal";
import { downstreamOf, layoutBlastGraph } from "./graph-layout";
import { edgeStroke, nodeState } from "./helpers";

// Two symbols that share one caller (`shared`) — hovering one must not light up the other.
const TWO: BlastRadius = {
  changed_symbols: [
    { name: "alpha", file: "src/a.ts", kind: "function" },
    { name: "beta", file: "src/b.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "alpha",
      callers: [
        { name: "onlyAlpha", file: "src/x/one.ts", line: 1 },
        { name: "shared", file: "src/x/two.ts", line: 2 },
      ],
      endpoints_affected: ["GET /one"],
      crons_affected: [],
    },
    {
      symbol: "beta",
      callers: [
        { name: "shared", file: "src/x/two.ts", line: 2 },
        { name: "onlyBeta", file: "src/x/three.ts", line: 3 },
      ],
      endpoints_affected: [],
      crons_affected: ["nightly"],
    },
  ],
  summary: "s",
  degraded: false,
  reason: null,
  caller_facts: [
    { file: "src/x/one.ts", endpoints: ["GET /one"], crons: [] },
    { file: "src/x/two.ts", endpoints: [], crons: [] },
    { file: "src/x/three.ts", endpoints: [], crons: ["nightly"] },
  ],
};

afterEach(cleanup);

describe("downstreamOf", () => {
  it("follows edges forward only: a symbol's callers and their endpoints/crons, not the other symbol", () => {
    const layout = layoutBlastGraph(TWO);
    const h = downstreamOf(layout, "symbols:alpha");
    expect([...h.nodes].sort()).toEqual(
      ["callers:src/x/one.ts:1", "callers:src/x/two.ts:2", "endpoints:GET /one", "symbols:alpha"].sort(),
    );
    expect(h.nodes.has("symbols:beta")).toBe(false);
    expect(h.nodes.has("callers:src/x/three.ts:3")).toBe(false);
    expect(h.nodes.has("crons:nightly")).toBe(false);
    expect(h.edges.size).toBe(3); // alpha→one, alpha→two, one→GET /one
  });
});

describe("graph highlight helpers", () => {
  it("nodeState / edgeStroke: idle without hover; active, linked and dimmed with it", () => {
    const layout = layoutBlastGraph(TWO);
    const h = downstreamOf(layout, "symbols:alpha");
    expect(nodeState("symbols:beta", null, null)).toBe("idle");
    expect(nodeState("symbols:alpha", h, "symbols:alpha")).toBe("active");
    expect(nodeState("callers:src/x/two.ts:2", h, "symbols:alpha")).toBe("linked");
    expect(nodeState("symbols:beta", h, "symbols:alpha")).toBe("dimmed");
    const lit = layout.edges.find((e) => e.id === "symbols:alpha->callers:src/x/one.ts:1")!;
    const dark = layout.edges.find((e) => e.id === "symbols:beta->callers:src/x/three.ts:3")!;
    expect(edgeStroke(lit, h)).toMatchObject({ strokeOpacity: 1, stroke: "var(--violet)" });
    expect(edgeStroke(dark, h).strokeOpacity).toBeLessThan(0.55);
    expect(edgeStroke(dark, null).strokeOpacity).toBe(0.55);
  });
});

describe("BlastGraphModal — hover highlight", () => {
  function renderModal() {
    render(
      <NextIntlClientProvider locale="en" messages={{ blast }}>
        <BlastGraphModal blast={TWO} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
  }
  const stateOf = (text: string) => screen.getByText(text).closest("[data-state]")!.getAttribute("data-state");

  it("hovering a symbol lights up its downstream and dims the rest; leaving restores", () => {
    renderModal();
    expect(stateOf("beta")).toBe("idle");

    fireEvent.mouseEnter(screen.getByText("alpha").closest("[data-state]")!);
    expect(stateOf("alpha")).toBe("active");
    expect(stateOf("onlyAlpha")).toBe("linked");
    expect(stateOf("shared")).toBe("linked");
    expect(stateOf("GET /one")).toBe("linked");
    expect(stateOf("beta")).toBe("dimmed");
    expect(stateOf("onlyBeta")).toBe("dimmed");
    expect(stateOf("nightly")).toBe("dimmed");

    fireEvent.mouseLeave(screen.getByText("alpha").closest("[data-state]")!);
    expect(stateOf("beta")).toBe("idle");
  });

  it("keyboard focus on a symbol highlights the same way", () => {
    renderModal();
    const beta = screen.getByText("beta").closest("[data-state]") as HTMLElement;
    expect(beta).toHaveAttribute("tabindex", "0");
    fireEvent.focus(beta);
    expect(stateOf("nightly")).toBe("linked");
    expect(stateOf("onlyAlpha")).toBe("dimmed");
    fireEvent.blur(beta);
    expect(stateOf("onlyAlpha")).toBe("idle");
  });
});
