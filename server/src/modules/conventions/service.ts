import {
  CONVENTION_RULE_MAX,
  type ConventionCandidate,
  type ConventionSkillDraft,
  type RepoConventions,
  type SetConventionsStatusRequest,
  type UpdateConventionRequest,
} from '@devdigest/shared';
import { AppError, ConflictError, ExternalServiceError } from '../../platform/errors.js';
import {
  CONFIG_SAMPLE_PATHS,
  MAX_CANDIDATES,
  MAX_MODEL_CANDIDATES,
  TOP_SAMPLE_FILES,
} from './constants.js';
import {
  NoAcceptedConventionsError,
  NoConventionSamplesError,
  buildSkillDraft,
  clampConfidence,
  dedupeCandidates,
  describeError,
  normalizeEvidencePath,
  verifyEvidence,
  type VerifiedConvention,
} from './domain.js';
import { buildExtractionMessages } from './prompt.js';
import type {
  ConventionModel,
  ConventionRepo,
  ConventionStore,
  RepoFiles,
  SampleSource,
} from './ports.js';
import type { ConventionSample, ExtractedConvention } from './types.js';

export interface ConventionServiceDeps {
  store: ConventionStore;
  files: RepoFiles;
  model: ConventionModel;
  samples: SampleSource;
}

/**
 * Conventions extractor (L02) — spec: server/specs/004-conventions.md.
 * Code picks the samples, the `conventions` model proposes rules, code checks
 * every rule's evidence against the clone; the user accepts / rejects / edits
 * the survivors and merges the accepted ones into a skill.
 *
 * Methods return `undefined` when the repo or candidate isn't in this workspace (route → 404).
 */
export class ConventionService {
  /** Repos with a scan in flight — a second concurrent scan is refused. */
  private running = new Set<string>();

  constructor(private deps: ConventionServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<RepoConventions | undefined> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    return repo ? this.snapshot(repo.id) : undefined;
  }

  /**
   * Run a scan (synchronously). New verified candidates replace the pending ones;
   * accepted and rejected candidates stay, and their rules are not proposed again.
   */
  async extract(workspaceId: string, repoId: string): Promise<RepoConventions | undefined> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    if (this.running.has(repo.id)) {
      throw new ConflictError(
        'A conventions scan is already running for this repo.',
        'conventions_scan_running',
      );
    }
    this.running.add(repo.id);
    try {
      await this.scan(workspaceId, repo);
    } finally {
      this.running.delete(repo.id);
    }
    return this.snapshot(repo.id);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionRequest,
  ): Promise<ConventionCandidate | undefined> {
    return this.deps.store.updateConvention(workspaceId, id, patch);
  }

  async setStatus(
    workspaceId: string,
    repoId: string,
    req: SetConventionsStatusRequest,
  ): Promise<RepoConventions | undefined> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    await this.deps.store.setStatus(workspaceId, repo.id, req.ids, req.status);
    return this.snapshot(repo.id);
  }

  /** The accepted candidates merged into one skill draft. Persists nothing. */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft | undefined> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    const accepted = await this.deps.store.listConventions(repo.id, ['accepted']);
    if (!accepted.length) throw new NoAcceptedConventionsError();
    return buildSkillDraft(repo.name, accepted);
  }

  private async snapshot(repoId: string): Promise<RepoConventions> {
    const [scan, candidates] = await Promise.all([
      this.deps.store.getLatestScan(repoId),
      this.deps.store.listConventions(repoId, ['pending', 'accepted']),
    ]);
    return { scan: scan ?? null, candidates };
  }

  private async scan(workspaceId: string, repo: ConventionRepo): Promise<void> {
    const headSha = (await this.deps.files.headSha(repo)) ?? null;
    const samples = await this.collectSamples(repo);
    if (!samples.length) throw new NoConventionSamplesError();
    const base = { workspaceId, repoId: repo.id, headSha, sampleFiles: samples.map((s) => s.path) };

    let result: Awaited<ReturnType<ConventionModel['extract']>>;
    try {
      result = await this.deps.model.extract(
        workspaceId,
        buildExtractionMessages(repo.fullName, samples),
      );
    } catch (err) {
      await this.deps.store.insertFailedScan({
        ...base,
        status: 'failed',
        model: null,
        candidateCount: 0,
        droppedCount: 0,
        error: describeError(err),
      });
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(`Conventions analysis failed: ${describeError(err)}`);
    }

    const { verified, dropped } = await this.verifyAll(
      repo,
      result.data.candidates.slice(0, MAX_MODEL_CANDIDATES),
      samples,
    );
    const reviewed = await this.deps.store.listConventions(repo.id, ['accepted', 'rejected']);
    const kept = dedupeCandidates(
      verified,
      reviewed.map((c) => c.rule),
    ).slice(0, MAX_CANDIDATES);

    await this.deps.store.replacePendingWithScan(
      {
        ...base,
        status: 'done',
        model: result.model,
        candidateCount: kept.length,
        droppedCount: dropped,
        error: null,
      },
      kept,
    );
  }

  /**
   * Sample selection — code only, no model (#39): the root lint / tsconfig /
   * prettier configs that exist, plus the top-ranked files from repo-intel.
   */
  private async collectSamples(repo: ConventionRepo): Promise<ConventionSample[]> {
    const ranked = await this.deps.samples.getConventionSamples(repo.id, TOP_SAMPLE_FILES);
    const paths = [...new Set([...CONFIG_SAMPLE_PATHS, ...ranked])];
    const read = await Promise.all(
      paths.map(async (path) => ({ path, text: await this.deps.files.readFile(repo, path) })),
    );
    return read.filter((s): s is ConventionSample => s.text !== undefined && s.text.trim() !== '');
  }

  /** Run the evidence gate on each candidate; the evidence file may be any file of the repo. */
  private async verifyAll(
    repo: ConventionRepo,
    candidates: ExtractedConvention[],
    samples: ConventionSample[],
  ): Promise<{ verified: VerifiedConvention[]; dropped: number }> {
    const files = new Map<string, string | undefined>(samples.map((s) => [s.path, s.text]));
    const verified: VerifiedConvention[] = [];
    let dropped = 0;
    for (const c of candidates) {
      const path = normalizeEvidencePath(c.evidence.file);
      const rule = c.rule.trim().slice(0, CONVENTION_RULE_MAX);
      if (!path || !rule) {
        dropped++;
        continue;
      }
      if (!files.has(path)) files.set(path, await this.deps.files.readFile(repo, path));
      const check = verifyEvidence(c.evidence, files.get(path));
      if (!check.ok) {
        dropped++;
        continue;
      }
      verified.push({
        rule,
        evidencePath: path,
        evidenceLineStart: check.lineStart,
        evidenceLineEnd: check.lineEnd,
        evidenceSnippet: check.snippet,
        confidence: clampConfidence(c.confidence),
      });
    }
    return { verified, dropped };
  }
}
