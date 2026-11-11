import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

let query = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

import { usePrDetailUrlState } from "./usePrDetailUrlState";

function setup(q: string) {
  query = q;
  return renderHook(() => usePrDetailUrlState("r1", "7")).result.current;
}

beforeEach(() => replace.mockClear());

describe("usePrDetailUrlState — file focus", () => {
  it("fileHref builds ?tab=diff&file&line, and omits line when null (AC-52, AC-67)", () => {
    const h = setup("");
    const withLine = new URL(h.fileHref("src/a.ts", 12), "http://x");
    expect(withLine.pathname).toBe("/repos/r1/pulls/7");
    expect(withLine.searchParams.get("tab")).toBe("diff");
    expect(withLine.searchParams.get("file")).toBe("src/a.ts");
    expect(withLine.searchParams.get("line")).toBe("12");
    expect(new URL(h.fileHref("src/a.ts", null), "http://x").searchParams.has("line")).toBe(false);
  });

  it("setTab uses replace and drops file and line (AC-55)", () => {
    const h = setup("tab=diff&file=src/a.ts&line=3");
    h.setTab("overview");
    expect(replace).toHaveBeenCalledTimes(1);
    const url = new URL(String(replace.mock.calls[0]?.[0]), "http://x");
    expect(url.searchParams.get("tab")).toBe("overview");
    expect(url.searchParams.has("file")).toBe(false);
    expect(url.searchParams.has("line")).toBe(false);
  });

  it("reads a valid target, and treats line=0 or line=abc as no line (AC-58)", () => {
    expect(setup("tab=diff&file=src/a.ts&line=12").focus).toEqual({ path: "src/a.ts", line: 12 });
    expect(setup("tab=diff&file=src/a.ts&line=0").focus).toEqual({ path: "src/a.ts", line: null });
    expect(setup("tab=diff&file=src/a.ts&line=abc").focus).toEqual({ path: "src/a.ts", line: null });
  });

  it("file and line are meaningful only on the diff tab", () => {
    expect(setup("tab=overview&file=src/a.ts&line=3").focus).toBeNull();
  });
});
