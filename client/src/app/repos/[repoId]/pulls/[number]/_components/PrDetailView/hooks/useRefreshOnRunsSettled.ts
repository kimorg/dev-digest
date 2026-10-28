"use client";

import React from "react";

/**
 * Calls `refresh` whenever the number of live runs drops, i.e. once per poll in which
 * at least one run settled. With "Run all" each agent's findings therefore show up as
 * soon as that agent finishes, on any tab (e.g. the diff), not only after the last one.
 * `usePrActiveRuns` polls, which drives the count.
 */
export function useRefreshOnRunsSettled(liveRunCount: number, refresh: () => void) {
  const previous = React.useRef(liveRunCount);
  React.useEffect(() => {
    if (liveRunCount < previous.current) refresh();
    previous.current = liveRunCount;
  }, [liveRunCount, refresh]);
}
