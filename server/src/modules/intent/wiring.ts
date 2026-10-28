import { Intent } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { INTENT_TIMEOUT_MS } from './constants.js';
import { isUnreadableFileError } from './helpers.js';
import { IntentRepository } from './repository.js';
import { IntentService } from './service.js';

/**
 * Composition for the intent module: its Postgres store, the clone's files (git
 * adapter), GitHub issues (fail-soft) and the `review_intent` feature model.
 * `container.prIntent` caches ONE instance so single-flight holds across callers.
 */
export function buildIntentService(container: Container): IntentService {
  return new IntentService({
    store: new IntentRepository(container.db),
    files: {
      async readFile(repo, path) {
        try {
          return await container.git.readFile(repo, path);
        } catch (err) {
          if (isUnreadableFileError(err)) return undefined;
          throw err;
        }
      },
    },
    issues: {
      async getIssue(repo, n) {
        // Linked issues only enrich the prompt — no token / offline / not found → skip.
        try {
          const github = await container.github();
          const issue = await github.getIssue(repo, n);
          return { number: issue.number, title: issue.title, body: issue.body ?? null };
        } catch {
          return undefined;
        }
      },
    },
    model: {
      resolve: (workspaceId) => container.featureModels.resolve(workspaceId, 'review_intent'),
      async derive(choice, messages) {
        const llm = await container.llm(choice.provider);
        const res = await llm.completeStructured({
          model: choice.model,
          schema: Intent,
          schemaName: 'Intent',
          messages,
          timeoutMs: INTENT_TIMEOUT_MS,
        });
        return {
          data: res.data,
          provider: choice.provider,
          model: res.model,
          tokensIn: res.tokensIn,
          tokensOut: res.tokensOut,
          costUsd: res.costUsd,
        };
      },
    },
  });
}
