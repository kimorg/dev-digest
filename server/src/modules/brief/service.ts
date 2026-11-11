import type { PrBriefRecord, PrBriefView } from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import {
  allowedBriefPaths,
  extractIssueRef,
  fitInputBudget,
  groundBriefOutput,
  isBriefStale,
  latestRunIdsPerAgent,
  pickContextDocPaths,
} from './domain.js';
import { BRIEF_SYSTEM, buildBriefMessages } from './prompt.js';
import type {
  BriefBlast,
  BriefDocs,
  BriefIntent,
  BriefIssues,
  BriefLog,
  BriefModel,
  BriefPull,
  BriefStore,
} from './ports.js';
import type { BriefInput } from './types.js';

export interface BriefServiceDeps {
  store: BriefStore;
  blast: BriefBlast;
  intent: BriefIntent;
  issues: BriefIssues;
  docs: BriefDocs;
  model: BriefModel;
  log: BriefLog;
}

/**
 * PR brief (spec: specs/006-pr-brief.md). `get` is read-only: it never calls a model or
 * GitHub. `generate` always regenerates with one model call; concurrent calls for one PR
 * share a single in-flight generation, keyed per workspace so a caller never joins a
 * generation whose workspace check it did not pass.
 */
export class BriefService {
  private inflight = new Map<string, Promise<PrBriefView>>();

  constructor(private deps: BriefServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrBriefView> {
    const pull = await this.deps.store.getPullSources(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const brief = await this.deps.store.getBrief(prId);
    return { brief: brief ?? null, stale: brief ? isBriefStale(brief, pull.headSha) : false };
  }

  generate(workspaceId: string, prId: string): Promise<PrBriefView> {
    const key = `${workspaceId}:${prId}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.run(workspaceId, prId).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async run(workspaceId: string, prId: string): Promise<PrBriefView> {
    const { store, model } = this.deps;
    const pull = await store.getPullSources(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    // The head the brief is generated for; a push during the call makes it stale, not wrong.
    const headSha = pull.headSha;
    const choice = await model.resolve(workspaceId);

    const input = await this.gatherInput(workspaceId, pull);
    const sections = fitInputBudget(input, BRIEF_SYSTEM.length);
    const messages = buildBriefMessages(sections);
    const promptChars = messages.reduce((n, m) => n + m.content.length, 0);

    let res;
    try {
      res = await model.generate(choice, messages);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(
        `PR brief generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const grounded = groundBriefOutput(
      res.data,
      allowedBriefPaths(
        pull.files.map((f) => f.path),
        input.blast,
      ),
    );
    const record: PrBriefRecord = {
      intent: input.intent,
      blast: input.blast,
      risks: { risks: grounded.risks },
      history: null,
      summary: grounded.summary,
      review_focus: grounded.reviewFocus,
      head_sha: headSha,
      generated_at: new Date().toISOString(),
      provider: res.provider,
      model: res.model,
      tokens_in: res.tokensIn,
      tokens_out: res.tokensOut,
      cost_usd: res.costUsd,
    };
    const stored = await store.upsertBrief(prId, record);
    this.deps.log.info(
      {
        provider: res.provider,
        model: res.model,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
        promptChars,
        droppedRisks: grounded.droppedRisks,
        droppedFocus: grounded.droppedFocus,
      },
      'pr brief generated',
    );
    return { brief: stored, stale: false };
  }

  /** Everything the prompt is made of. Missing optional inputs (intent, issue, docs) are skipped. */
  private async gatherInput(workspaceId: string, pull: BriefPull): Promise<BriefInput> {
    const { blast, intent, issues } = this.deps;
    const body = pull.body?.trim() ? pull.body : null;
    const issueNumber = body ? extractIssueRef(body, pull.repo.fullName) : undefined;
    const [blastRadius, storedIntent, issue, docs] = await Promise.all([
      blast.get(workspaceId, pull.id),
      intent.get(workspaceId, pull.id),
      issueNumber != null ? issues.getIssue(pull.repo, issueNumber) : Promise.resolve(undefined),
      this.readDocs(pull),
    ]);
    return {
      title: pull.title,
      description: body,
      issue: issue ?? null,
      intent: storedIntent,
      blast: blastRadius,
      files: pull.files,
      docs,
    };
  }

  /** Project-context docs that reached the latest review runs' prompts, read from the clone. */
  private async readDocs(pull: BriefPull): Promise<BriefInput['docs']> {
    const { store, docs } = this.deps;
    if (!pull.repo.clonePath) return [];
    const runIds = latestRunIdsPerAgent(await store.listReviewRunsForPull(pull.id));
    if (runIds.length === 0) return [];
    const traces = await store.listSpecsReadForRuns(runIds);
    const byRun = new Map(traces.map((r) => [r.runId, r.specsRead]));
    const paths = pickContextDocPaths(runIds.map((id) => byRun.get(id) ?? []));
    const clonePath = pull.repo.clonePath;
    const read = await Promise.all(
      paths.map(async (path) => ({ path, content: await docs.read(clonePath, path) })),
    );
    return read.filter((d): d is { path: string; content: string } => d.content != null);
  }
}
