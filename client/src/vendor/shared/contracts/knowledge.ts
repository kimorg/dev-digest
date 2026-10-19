import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum([
  'manual',
  'imported_url',
  'imported_file',
  'extracted',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// Field limits shared by create / update / import (L02 Skills).
export const SKILL_NAME_MAX = 80;
export const SKILL_DESCRIPTION_MAX = 300;
export const SKILL_BODY_MAX = 32_000;

const SkillName = z.string().trim().min(1).max(SKILL_NAME_MAX);
// The description is the skill's interface — a directive sentence, required.
const SkillDescription = z.string().trim().min(1).max(SKILL_DESCRIPTION_MAX);
const SkillBody = z.string().min(1).max(SKILL_BODY_MAX);

/** A skill as listed on the Skills page: + how many agents link it. */
export const SkillListItem = Skill.extend({
  agent_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type SkillListItem = z.infer<typeof SkillListItem>;

/**
 * POST /skills. An `imported_file` skill is saved disabled until the user vets it;
 * `enabled` overrides that default. `extracted` = built from accepted conventions.
 */
export const CreateSkillRequest = z.object({
  name: SkillName,
  description: SkillDescription,
  type: SkillType,
  body: SkillBody,
  source: z.enum(['manual', 'imported_file', 'extracted']).optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string().max(500)).max(200).optional(),
});
export type CreateSkillRequest = z.infer<typeof CreateSkillRequest>;

/** PUT /skills/:id — partial; only a body change creates a new version. */
export const UpdateSkillRequest = z
  .object({
    name: SkillName,
    description: SkillDescription,
    type: SkillType,
    body: SkillBody,
    enabled: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one field' });
export type UpdateSkillRequest = z.infer<typeof UpdateSkillRequest>;

/** One immutable body snapshot from `skill_versions`. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** POST /skills/import — a .md or .zip file, base64-encoded. Persists nothing. */
export const SkillImportRequest = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
});
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

/** The parsed core of an imported file, shown for review before saving. */
export const SkillImportDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  /** Archive entries other than SKILL.md — listed, never executed or stored. */
  ignored_files: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SkillImportDraft = z.infer<typeof SkillImportDraft>;

// ---- Conventions ----
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const CONVENTION_RULE_MAX = 500;

/** A house rule proposed by the extractor; its evidence lines were checked against the clone. */
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line_start: z.number().int(),
  evidence_line_end: z.number().int(),
  /** The real text of those lines, read from the repo (not the model's quote). */
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  created_at: z.string(),
  updated_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** One extractor run. `failed` keeps the error; candidates come only from `done` scans. */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: z.enum(['done', 'failed']),
  model: z.string().nullable(),
  /** Commit the samples were read at; evidence lines refer to it (null when unknown). */
  head_sha: z.string().nullable(),
  sample_files: z.array(z.string()),
  sample_count: z.number().int(),
  candidate_count: z.number().int(),
  /** Candidates the model proposed whose evidence did not check out. */
  dropped_count: z.number().int(),
  error: z.string().nullable(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** GET /repos/:id/conventions — the latest scan + non-rejected candidates. */
export const RepoConventions = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type RepoConventions = z.infer<typeof RepoConventions>;

/** PUT /conventions/:id — accept / reject / inline edit of the rule. */
export const UpdateConventionRequest = z
  .object({
    rule: z.string().trim().min(1).max(CONVENTION_RULE_MAX),
    status: ConventionStatus,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one field' });
export type UpdateConventionRequest = z.infer<typeof UpdateConventionRequest>;

/** POST /repos/:id/conventions/set-status — Accept all / Deselect all. */
export const SetConventionsStatusRequest = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(['pending', 'accepted']),
});
export type SetConventionsStatusRequest = z.infer<typeof SetConventionsStatusRequest>;

/** GET /repos/:id/conventions/skill-draft — accepted candidates merged into one skill. */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  convention_count: z.number().int(),
  evidence_files: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  /** Number of linked skills (list/detail responses). */
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
