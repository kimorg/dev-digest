/* RunCostBadge — what an agent run (or a PR's runs) cost. Two variants:
   compact  → "$0.014"               (PR list COST column)
   detailed → "9,119 tok · $0.0013"  (Agent-runs timeline, VerdictBanner)
   Unknown cost renders "—", never "$0.00". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCost, formatTokenTotal } from "@/lib/format-cost";

const baseStyle: React.CSSProperties = { whiteSpace: "nowrap" };

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
  style,
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
  style?: React.CSSProperties;
}) {
  const t = useTranslations("common");
  const cost = formatCost(costUsd);
  const tokens = variant === "detailed" ? formatTokenTotal(tokensIn, tokensOut) : null;
  return (
    <span className="mono tnum" data-testid="run-cost-badge" style={{ ...baseStyle, ...style }}>
      {tokens ? `${t("runCost.tokens", { count: tokens })} · ${cost}` : cost}
    </span>
  );
}
