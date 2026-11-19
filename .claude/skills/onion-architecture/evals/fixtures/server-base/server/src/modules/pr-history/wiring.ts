import type { Container } from '../../platform/container.js';
import { PrHistoryRepository } from './repository.js';
import { PrHistoryService } from './service.js';

/**
 * Composition for the pr-history module: its Postgres store plus GitHub, resolved lazily so a
 * missing token surfaces as a `ConfigError` inside the lookup (→ `no_token`), not at startup.
 */
export function buildPrHistoryService(
  container: Container,
  log: { warn: (obj: object, msg: string) => void },
): PrHistoryService {
  return new PrHistoryService({
    store: new PrHistoryRepository(container.db),
    source: {
      listCommitShasForPath: async (repo, path, opts) =>
        (await container.github()).listCommitShasForPath(repo, path, opts),
      listPullsForCommit: async (repo, sha) => (await container.github()).listPullsForCommit(repo, sha),
    },
    now: Date.now,
    onSourceError: (message) => log.warn({ message }, 'prior PR lookup failed'),
  });
}
