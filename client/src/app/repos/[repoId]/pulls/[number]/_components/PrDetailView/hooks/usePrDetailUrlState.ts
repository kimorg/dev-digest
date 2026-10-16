"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/lib/routes";
import { PR_TABS, type PrTab } from "@/app/repos/[repoId]/pulls/[number]/constants";

/** PR-detail view state that lives in the URL: the active tab (?tab=) and the
    run whose trace drawer is open (?trace=). Writes replace the history entry. */
export function usePrDetailUrlState(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();

  const requested = search.get("tab");
  const tab: PrTab = PR_TABS.includes(requested as PrTab) ? (requested as PrTab) : PR_TABS[0];
  const traceRunId = search.get("trace");

  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(routes.pull(repoId, number, sp));
  };

  return {
    tab,
    traceRunId,
    setTab: (next: string) => setParam("tab", next),
    openTrace: (runId: string) => setParam("trace", runId),
    closeTrace: () => setParam("trace", null),
  };
}
