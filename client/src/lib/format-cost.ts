/**
 * Shared cost/token formatting for the Run Cost Badge (PR list COST column,
 * Agent-runs timeline, VerdictBanner, run trace COST stat).
 *
 * Missing data renders "—", never "$0.00": a run without a known cost (failed,
 * pre-cost-tracking, unpriced model) must not look free. A genuine 0 (free
 * model) renders "$0".
 */

/** USD with precision scaled to magnitude: $0.0013 · $0.014 · $1.23 · "—" when unknown. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Total tokens (in + out) with thousands separators, e.g. 9119 → "9,119"; null when unknown/zero. */
export function formatTokenTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  const total = (tokensIn ?? 0) + (tokensOut ?? 0);
  return total > 0 ? total.toLocaleString("en-US") : null;
}
