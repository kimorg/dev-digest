/* hooks/query-keys.ts — the one place query keys are built. Domain hook files
   use these for both their queries and their invalidations, so a key can't drift
   between the hook that reads it and the mutation that refreshes it.
   Shape: ["<kebab-resource>", id?] — singular for detail, plural for list. */

export const queryKeys = {
  settings: () => ["settings"] as const,
  secretsStatus: () => ["secrets-status"] as const,
  /** No provider → every provider's model list (for invalidation). */
  providerModels: (provider?: string | null) =>
    provider === undefined ? (["provider-models"] as const) : (["provider-models", provider] as const),

  repos: () => ["repos"] as const,
  pulls: (repoId: string | null | undefined) => ["pulls", repoId] as const,
  pull: (prId: string | number | null | undefined) => ["pull", prId] as const,
  contextFiles: (repoId: string | null | undefined) => ["context-files", repoId] as const,
  repoIntelState: (repoId: string | null | undefined) => ["repo-intel-state", repoId] as const,

  agents: () => ["agents"] as const,
  agent: (id: string | null | undefined) => ["agent", id] as const,
  /** No agent → every agent's skill links (for invalidation). */
  agentSkills: (agentId?: string | null) =>
    agentId === undefined ? (["agent-skills"] as const) : (["agent-skills", agentId] as const),

  skills: () => ["skills"] as const,
  skill: (id: string | null | undefined) => ["skill", id] as const,
  skillVersions: (id: string | null | undefined) => ["skill-versions", id] as const,

  repoConventions: (repoId: string | null | undefined) => ["repo-conventions", repoId] as const,
  conventionSkillDraft: (repoId: string | null | undefined) => ["convention-skill-draft", repoId] as const,

  prActiveRuns: (prId: string | null | undefined) => ["pr-active-runs", prId] as const,
  prRuns: (prId: string | null | undefined) => ["pr-runs", prId] as const,
  prReviews: (prId: string | null | undefined) => ["pr-reviews", prId] as const,
  prComments: (prId: string | null | undefined) => ["pr-comments", prId] as const,
  prIntent: (prId: string | null | undefined) => ["pr-intent", prId] as const,
  runTrace: (runId: string | null | undefined) => ["run-trace", runId] as const,
};
