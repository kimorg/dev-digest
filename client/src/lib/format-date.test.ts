import { describe, it, expect } from "vitest";
import { formatDateTime, formatTime, parseTimestamp } from "./format-date";

describe("format-date — parseTimestamp", () => {
  it("returns epoch ms for valid ISO strings and 0 for missing or invalid ones", () => {
    expect(parseTimestamp("2026-10-01T00:00:00Z")).toBe(Date.UTC(2026, 9, 1));
    expect(parseTimestamp(null)).toBe(0);
    expect(parseTimestamp(undefined)).toBe(0);
    expect(parseTimestamp("not a date")).toBe(0);
  });
});

describe("format-date — display", () => {
  it("formats valid timestamps with the browser locale", () => {
    const iso = "2026-10-01T10:00:00Z";
    expect(formatDateTime(iso)).toBe(new Date(iso).toLocaleString());
    expect(formatTime(iso)).toBe(new Date(iso).toLocaleTimeString());
  });

  it("falls back to the raw string when unparseable", () => {
    expect(formatDateTime("garbage")).toBe("garbage");
    expect(formatTime("garbage")).toBe("garbage");
  });
});
