import type { PrHistory, PrHistoryDegradedReason } from '@devdigest/shared';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import {
  HISTORY_CACHE_MAX,
  HISTORY_CACHE_TTL_MS,
  HISTORY_SHA_BATCH,
  MAX_HISTORY_COMMITS_PER_FILE,
  MAX_HISTORY_FILES,
  MAX_HISTORY_PRS,
  MAX_HISTORY_SHAS,
} from './constants.js';
import { mergeHistory, pickHistoryFiles, pickHistoryShas } from './domain.js';
import type { PrHistoryStore, PullHistorySource } from './ports.js';
import type { PullForHistory } from './types.js';

export interface PrHistoryServiceDeps {
  store: PrHistoryStore;
  source: PullHistorySource;
  now: () => number;
  /** Receives the message of a GitHub failure (never the error object). */
  onSourceError?: (message: string) => void;
}

const degraded = (reason: PrHistoryDegradedReason): PrHistory => ({ history: [], degraded: true, reason });

/**
 * Prior PRs that touched the same files, from GitHub's commit history. Never throws on a GitHub
 * failure. Results are cached per `prId:headSha`; degraded results are not.
 */
export class PrHistoryService {
  private cache = new Map<string, { at: number; value: PrHistory }>();

  constructor(private deps: PrHistoryServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrHistory> {
    const pull = await this.deps.store.getPullForHistory(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const key = `${prId}:${pull.headSha}`;
    const hit = this.cache.get(key);
    if (hit && this.deps.now() - hit.at < HISTORY_CACHE_TTL_MS) return hit.value;

    try {
      const value = await this.lookup(pull);
      this.remember(key, value);
      return value;
    } catch (err) {
      if (err instanceof ConfigError) return degraded('no_token');
      this.deps.onSourceError?.(err instanceof Error ? err.message : 'unknown error');
      return degraded('github_error');
    }
  }

  private async lookup(pull: PullForHistory): Promise<PrHistory> {
    const { source } = this.deps;
    const perFile = await Promise.all(
      pickHistoryFiles(pull.files, MAX_HISTORY_FILES).map(async (path) => ({
        path,
        shas: await source.listCommitShasForPath(pull.repo, path, {
          ref: pull.base,
          limit: MAX_HISTORY_COMMITS_PER_FILE,
        }),
      })),
    );
    const shas = pickHistoryShas(perFile, MAX_HISTORY_SHAS);

    const hits: { paths: string[]; pulls: Awaited<ReturnType<PullHistorySource['listPullsForCommit']>> }[] = [];
    let history = mergeHistory(hits, pull.number, MAX_HISTORY_PRS);
    for (let i = 0; i < shas.length && history.length < MAX_HISTORY_PRS; i += HISTORY_SHA_BATCH) {
      const batch = shas.slice(i, i + HISTORY_SHA_BATCH);
      hits.push(
        ...(await Promise.all(
          batch.map(async (s) => ({ paths: s.paths, pulls: await source.listPullsForCommit(pull.repo, s.sha) })),
        )),
      );
      history = mergeHistory(hits, pull.number, MAX_HISTORY_PRS);
    }
    return { history, degraded: false, reason: null };
  }

  private remember(key: string, value: PrHistory): void {
    if (this.cache.size >= HISTORY_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { at: this.deps.now(), value });
  }
}
