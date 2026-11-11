import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Risk icon by `kind`; any other kind falls back to the triangle. */
export const RISK_ICON: Record<string, IconName> = {
  security: "Shield",
  auth: "Shield",
  dependency: "Package",
  performance: "Zap",
};
export const RISK_ICON_FALLBACK: IconName = "AlertTriangle";

/** Display order of severities, most severe first. */
export const SEVERITY_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-secondary)",
};
