"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/lib/routes";
import { PR_TABS, type PrTab } from "@/app/repos/[repoId]/pulls/[number]/constants";

/** A file (and optionally a line) the Files changed tab should open at. */
export interface DiffFocusTarget {
  path: string;
  line: number | null;
}

/** `line` is a 1-based new-file line number; anything else is ignored. */
function parseLine(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** PR-detail view state that lives in the URL: the active tab (?tab=), the run
    whose trace drawer is open (?trace=) and the Files changed target (?file=&line=,
    read only on the diff tab). Writes replace the history entry; opening a file
    is a plain link (`fileHref`) so it adds a history entry and Back returns. */
export function usePrDetailUrlState(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();

  const requested = search.get("tab");
  const tab: PrTab = PR_TABS.includes(requested as PrTab) ? (requested as PrTab) : PR_TABS[0];
  const traceRunId = search.get("trace");
  const file = search.get("file");
  const focus: DiffFocusTarget | null =
    tab === "diff" && file ? { path: file, line: parseLine(search.get("line")) } : null;

  const setParams = (changes: Record<string, string | null>) => {
    const sp = new URLSearchParams(search.toString());
    for (const [key, val] of Object.entries(changes)) {
      if (val == null) sp.delete(key);
      else sp.set(key, val);
    }
    router.replace(routes.pull(repoId, number, sp));
  };

  /** URL that opens Files changed at `path` (and `line`, when given). */
  const fileHref = (path: string, line: number | null) => {
    const sp = new URLSearchParams({ tab: "diff", file: path });
    if (line != null) sp.set("line", String(line));
    return routes.pull(repoId, number, sp);
  };

  return {
    tab,
    traceRunId,
    focus,
    fileHref,
    setTab: (next: string) => setParams({ tab: next, file: null, line: null }),
    openTrace: (runId: string) => setParams({ trace: runId }),
    closeTrace: () => setParams({ trace: null }),
    clearFocus: () => setParams({ file: null, line: null }),
  };
}
