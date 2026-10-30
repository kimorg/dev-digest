"use client";

import React from "react";
import { usePrReviews } from "@/lib/hooks/reviews";
import { collectDiffFindings } from "../helpers";

/** Findings for the diff, from the same source as the Agent runs tab, plus whether it has loaded. */
export function useDiffFindings(prId: string | null) {
  const { data, isSuccess } = usePrReviews(prId);
  const findings = React.useMemo(() => collectDiffFindings(data ?? []), [data]);
  return { ...findings, isReady: isSuccess };
}
