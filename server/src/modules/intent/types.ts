import type { PrIntentResult, PrIntentView } from '@devdigest/shared';

/** What the model call cost; null when no model call happened (intent reused). */
export interface IntentUsage {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export interface PrIntentOutcome {
  result: PrIntentResult;
  usage: IntentUsage | null;
  /** Whether out-of-scope findings may be dropped for this intent (false at low confidence). */
  scopeFilter: boolean;
}

/**
 * Facade other modules (reviews) use to get a PR's intent. Resolved as
 * `container.prIntent`. `get` is read-only (never calls a model); `ensure`
 * regenerates only when the PR fingerprint changed.
 */
export interface PrIntents {
  get(workspaceId: string, prId: string): Promise<PrIntentView>;
  ensure(workspaceId: string, prId: string): Promise<PrIntentOutcome>;
}
