import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRefreshOnRunsSettled } from "./useRefreshOnRunsSettled";

function setup(initial: number) {
  const refresh = vi.fn();
  const view = renderHook(({ count }) => useRefreshOnRunsSettled(count, refresh), { initialProps: { count: initial } });
  return { refresh, change: (count: number) => view.rerender({ count }) };
}

describe("useRefreshOnRunsSettled — transitions", () => {
  it("refreshes once when the live runs go from 1 to 0", () => {
    const { refresh, change } = setup(1);
    expect(refresh).not.toHaveBeenCalled();
    change(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    change(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on every drop while other runs are still live (2 → 1 → 0)", () => {
    const { refresh, change } = setup(2);
    change(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    change(0);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not refresh when the count stays the same or grows", () => {
    const { refresh, change } = setup(0);
    change(0);
    change(2);
    change(2);
    expect(refresh).not.toHaveBeenCalled();
  });
});
