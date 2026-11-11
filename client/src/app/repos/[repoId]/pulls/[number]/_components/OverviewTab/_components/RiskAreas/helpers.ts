import type { IconName } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RISK_ICON, RISK_ICON_FALLBACK, SEVERITY_ORDER } from "./constants";

/** Severity order (high → low); the model's order is kept within one severity. */
export function sortRisksBySeverity(risks: readonly Risk[]): Risk[] {
  return risks
    .map((risk, index) => ({ risk, index }))
    .sort((a, b) => SEVERITY_ORDER[a.risk.severity] - SEVERITY_ORDER[b.risk.severity] || a.index - b.index)
    .map((x) => x.risk);
}

export function riskIconName(kind: string): IconName {
  return RISK_ICON[kind.trim().toLowerCase()] ?? RISK_ICON_FALLBACK;
}
