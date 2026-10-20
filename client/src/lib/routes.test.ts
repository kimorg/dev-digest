import { describe, it, expect } from "vitest";
import { routes } from "./routes";

describe("routes", () => {
  it("builds screen paths", () => {
    expect(routes.pulls("r1")).toBe("/repos/r1/pulls");
    expect(routes.pull("r1", 42)).toBe("/repos/r1/pulls/42");
    expect(routes.agent("a1")).toBe("/agents/a1");
    expect(routes.conventions("r1")).toBe("/repos/r1/conventions");
    expect(routes.settings()).toBe("/settings/api-keys");
    expect(routes.settings("models")).toBe("/settings/models");
  });

  it("appends a query string only when it is non-empty", () => {
    expect(routes.agent("a1", { tab: "config" })).toBe("/agents/a1?tab=config");
    expect(routes.pull("r1", 42, new URLSearchParams())).toBe("/repos/r1/pulls/42");
    expect(routes.pulls("r1", new URLSearchParams("status=all"))).toBe("/repos/r1/pulls?status=all");
  });
});
