import { describe, it, expect } from "vitest";
import { countOpenCriticals } from "./helpers";

describe("countOpenCriticals", () => {
  it("counts only critical findings that haven't been dismissed", () => {
    expect(
      countOpenCriticals([
        { severity: "CRITICAL", dismissed_at: null },
        { severity: "CRITICAL", dismissed_at: "2026-10-01T00:00:00Z" },
        { severity: "WARNING", dismissed_at: null },
      ]),
    ).toBe(1);
  });
});
