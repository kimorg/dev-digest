import type { Finding } from '@devdigest/shared';

/**
 * Scope filter — runs AFTER citation grounding, only when a PR intent was
 * supplied and the caller enabled it (the server skips it at low confidence).
 *
 * The review model tags each finding `in_scope` (it sees the intent in the
 * prompt). Rules, all fail-open:
 *  - `in_scope` missing/true → kept;
 *  - `kind` other than 'finding' (secret_leak, lethal_trifecta, …) → never filtered;
 *  - out-of-scope and NOT serious → dropped;
 *  - out-of-scope and serious (CRITICAL or category security) → collapsed into
 *    exactly ONE kept signal (highest severity, then confidence) so a real
 *    defect is never silently hidden by an (injectable) scope claim.
 */

export interface ScopeResult {
  kept: Finding[];
  filtered: { finding: Finding; reason: string }[];
  /** The single surviving out-of-scope serious finding, or null. */
  signal: Finding | null;
  /** Serious out-of-scope findings folded into `signal` (excluding it). */
  collapsed: number;
}

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  CRITICAL: 2,
  WARNING: 1,
  SUGGESTION: 0,
};

export const OUT_OF_SCOPE_PREFIX = "Outside this PR's stated scope — ";

function isSerious(f: Finding): boolean {
  return f.severity === 'CRITICAL' || f.category === 'security';
}

export function applyScopeFilter(findings: Finding[]): ScopeResult {
  const kept: Finding[] = [];
  const filtered: { finding: Finding; reason: string }[] = [];
  const serious: Finding[] = [];

  for (const f of findings) {
    const outOfScope = f.in_scope === false && (f.kind ?? 'finding') === 'finding';
    if (!outOfScope) {
      kept.push(f);
    } else if (isSerious(f)) {
      serious.push(f);
    } else {
      filtered.push({ finding: f, reason: 'out of PR scope' });
    }
  }

  if (serious.length === 0) return { kept, filtered, signal: null, collapsed: 0 };

  const sorted = [...serious].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence,
  );
  const top = sorted[0]!;
  const rest = sorted.slice(1);
  for (const f of rest) {
    filtered.push({ finding: f, reason: 'serious out-of-scope finding collapsed into one signal' });
  }
  const more = rest.length > 0 ? ` (+${rest.length} more collapsed, see run trace)` : '';
  const signal: Finding = {
    ...top,
    rationale: `${OUT_OF_SCOPE_PREFIX}${top.rationale}${more}`,
  };
  // Keep original ordering position of the signal's source among the survivors.
  const idx = findings.indexOf(top);
  const before = kept.filter((k) => findings.indexOf(k) < idx);
  const after = kept.filter((k) => findings.indexOf(k) > idx);
  return { kept: [...before, signal, ...after], filtered, signal, collapsed: rest.length };
}
