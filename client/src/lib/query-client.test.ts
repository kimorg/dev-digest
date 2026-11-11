import { describe, it, expect, vi, beforeEach } from "vitest";
import { MutationObserver } from "@tanstack/react-query";

vi.mock("@/lib/toast", () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), toast: vi.fn() },
}));

import { notify } from "@/lib/toast";
import { createQueryClient } from "./query-client";

async function failingMutation(meta?: Record<string, unknown>) {
  const qc = createQueryClient();
  const observer = new MutationObserver(qc, {
    mutationFn: async () => {
      throw new Error("model exploded");
    },
    meta,
  });
  await observer.mutate().catch(() => undefined);
}

beforeEach(() => vi.mocked(notify.error).mockClear());

describe("createQueryClient — mutation error toast", () => {
  it("toasts a failed mutation with its message", async () => {
    await failingMutation();
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.error).toHaveBeenCalledWith("model exploded");
  });

  it("stays silent for a mutation with meta.silent (AC-34, AC-66)", async () => {
    await failingMutation({ silent: true });
    expect(notify.error).not.toHaveBeenCalled();
  });
});
