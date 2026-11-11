import { PrBriefModelResult } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { BRIEF_TIMEOUT_MS } from './constants.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';
import type { BriefLog } from './ports.js';

/**
 * Composition for the brief module: its Postgres store, the blast and intent facades, GitHub
 * issues (fail-soft), the clone's docs and the `risk_brief` feature model.
 */
export function buildBriefService(container: Container, log: BriefLog): BriefService {
  return new BriefService({
    store: new BriefRepository(container.db),
    blast: {
      async get(workspaceId, prId) {
        return (await container.prBlast.get(workspaceId, prId)).blast;
      },
    },
    intent: {
      async get(workspaceId, prId) {
        const { intent } = await container.prIntent.get(workspaceId, prId);
        return intent
          ? { intent: intent.intent, in_scope: intent.in_scope, out_of_scope: intent.out_of_scope }
          : null;
      },
    },
    issues: {
      async getIssue(repo, n) {
        // A linked issue only enriches the prompt — no token / offline / not found → skip.
        try {
          const github = await container.github();
          const issue = await github.getIssue(repo, n);
          return { number: issue.number, title: issue.title, body: issue.body ?? null };
        } catch {
          return undefined;
        }
      },
    },
    docs: {
      async read(clonePath, path) {
        const res = await container.contextDocSource.read(clonePath, path);
        return res.status === 'ok' ? res.content : undefined;
      },
    },
    model: {
      resolve: (workspaceId) => container.featureModels.resolve(workspaceId, 'risk_brief'),
      async generate(choice, messages) {
        const llm = await container.llm(choice.provider);
        const res = await llm.completeStructured({
          model: choice.model,
          schema: PrBriefModelResult,
          schemaName: 'PrBrief',
          messages,
          timeoutMs: BRIEF_TIMEOUT_MS,
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
    log,
  });
}
