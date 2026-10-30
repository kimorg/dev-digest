import type { FeatureModelChoice, PrIntentView } from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { MAX_BODY_CHARS, MAX_DOC_CHARS, MAX_ISSUE_CHARS } from './constants.js';
import {
  buildIntentSources,
  computeIntentFingerprint,
  contentFromAddedFilePatch,
  deriveConfidence,
  extractDocRefs,
  extractIssueRef,
  normalizeIntent,
  shouldApplyScopeFilter,
} from './domain.js';
import type { IntentIssue } from './prompt.js';
import { buildIntentMessages } from './prompt.js';
import type { IntentModel, IntentPull, IntentStore, IssueSource, RepoFiles } from './ports.js';
import type { PrIntentOutcome, PrIntents } from './types.js';

export interface IntentServiceDeps {
  store: IntentStore;
  files: RepoFiles;
  issues: IssueSource;
  model: IntentModel;
}

interface IntentContext {
  pull: IntentPull;
  choice: FeatureModelChoice;
  docs: { path: string; content: string | undefined }[];
  fingerprint: string;
}

/**
 * PR intent (spec: docs/plans/002-intent-layer.md). `get` is read-only: it never
 * calls a model or GitHub. `ensure` regenerates only when the fingerprint of
 * the PR's inputs (or the chosen model) changed; concurrent calls for one PR
 * share a single in-flight generation, keyed per workspace so a caller never
 * joins a generation whose workspace check it did not pass.
 */
export class IntentService implements PrIntents {
  private inflight = new Map<string, Promise<PrIntentOutcome>>();

  constructor(private deps: IntentServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntentView> {
    const ctx = await this.context(workspaceId, prId);
    const stored = await this.deps.store.getIntent(prId);
    return {
      intent: stored?.record ?? null,
      stale: !!stored && stored.fingerprint !== ctx.fingerprint,
    };
  }

  ensure(workspaceId: string, prId: string): Promise<PrIntentOutcome> {
    const key = `${workspaceId}:${prId}`;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = this.run(workspaceId, prId).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async run(workspaceId: string, prId: string): Promise<PrIntentOutcome> {
    const ctx = await this.context(workspaceId, prId);
    const stored = await this.deps.store.getIntent(prId);
    if (stored && stored.fingerprint === ctx.fingerprint) {
      return {
        result: { intent: stored.record, regenerated: false },
        usage: null,
        scopeFilter: shouldApplyScopeFilter(stored.record.confidence),
      };
    }

    const { pull, docs, choice } = ctx;
    const body = pull.body?.trim() ? pull.body : null;
    const issueNumber = body ? extractIssueRef(body, pull.repo.fullName) : undefined;
    const issue = issueNumber != null ? await this.fetchIssue(pull, issueNumber) : undefined;
    const loadedDocs = docs.filter((d): d is { path: string; content: string } => d.content != null);

    const messages = buildIntentMessages({
      title: pull.title,
      branch: pull.branch,
      body: body?.slice(0, MAX_BODY_CHARS) ?? null,
      issue,
      docs: loadedDocs,
      commits: pull.commits.map((c) => (c.message.split('\n')[0] ?? '').slice(0, 200)),
      files: pull.files.map(({ path, additions, deletions }) => ({ path, additions, deletions })),
    });

    let res;
    try {
      res = await this.deps.model.derive(choice, messages);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(
        `Intent detection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const record = await this.deps.store.upsertIntent(prId, {
      intent: normalizeIntent(res.data),
      confidence: deriveConfidence({
        docsLoaded: loadedDocs.length,
        issueLoaded: issue != null,
        bodyChars: body?.length ?? 0,
      }),
      sources: buildIntentSources({
        hasBody: body != null,
        issueNumber: issue?.number,
        docPaths: loadedDocs.map((d) => d.path),
        hasCommits: pull.commits.length > 0,
        hasFiles: pull.files.length > 0,
      }),
      provider: res.provider,
      model: res.model,
      fingerprint: ctx.fingerprint,
    });
    return {
      result: { intent: record, regenerated: true },
      scopeFilter: shouldApplyScopeFilter(record.confidence),
      usage: {
        provider: res.provider,
        model: res.model,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      },
    };
  }

  /** Everything the fingerprint is made of: the PR, linked docs, and the chosen model. No LLM, no GitHub. */
  private async context(workspaceId: string, prId: string): Promise<IntentContext> {
    const pull = await this.deps.store.getPullSources(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const choice = await this.deps.model.resolve(workspaceId);
    const docs = await this.readDocs(pull);
    const fingerprint = computeIntentFingerprint({
      provider: choice.provider,
      model: choice.model,
      title: pull.title,
      body: pull.body,
      headSha: pull.headSha,
      docs,
    });
    return { pull, choice, docs, fingerprint };
  }

  /** Docs linked from the description: a file added by this PR (from its patch), else the clone. */
  private async readDocs(pull: IntentPull): Promise<IntentContext['docs']> {
    const refs = pull.body ? extractDocRefs(pull.body, pull.repo.fullName) : [];
    return Promise.all(
      refs.map(async (path) => {
        const added = contentFromAddedFilePatch(pull.files.find((f) => f.path === path)?.patch);
        const content = added ?? (await this.deps.files.readFile(pull.repo, path));
        // '' means "no file" (mock git client), same as a missing one.
        return { path, content: content ? content.slice(0, MAX_DOC_CHARS) : undefined };
      }),
    );
  }

  private async fetchIssue(pull: IntentPull, n: number): Promise<IntentIssue | undefined> {
    const issue = await this.deps.issues.getIssue(pull.repo, n);
    return issue
      ? { number: issue.number, title: issue.title, body: issue.body?.slice(0, MAX_ISSUE_CHARS) ?? null }
      : undefined;
  }
}
