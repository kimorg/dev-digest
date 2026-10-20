import type { Container } from '../../platform/container.js';
import { EXTRACTION_TIMEOUT_MS } from './constants.js';
import { isUnreadableFileError } from './helpers.js';
import { ConventionRepository } from './repository.js';
import { ConventionService } from './service.js';
import { ConventionExtraction } from './types.js';

/**
 * Composition for the conventions module: its Postgres store, the clone's files
 * (git adapter), the `conventions` feature model and repo-intel's ranked samples.
 */
export function buildConventionService(container: Container): ConventionService {
  return new ConventionService({
    store: new ConventionRepository(container.db),
    files: {
      async readFile(repo, path) {
        try {
          return await container.git.readFile(repo, path);
        } catch (err) {
          if (isUnreadableFileError(err)) return undefined;
          throw err;
        }
      },
      async headSha(repo) {
        // Only used to pin GitHub links; a scan doesn't fail without it.
        return container.git.currentHead(repo).catch(() => undefined);
      },
    },
    model: {
      async extract(workspaceId, messages) {
        const { provider, model } = await container.featureModels.resolve(workspaceId, 'conventions');
        const llm = await container.llm(provider);
        const res = await llm.completeStructured({
          model,
          schema: ConventionExtraction,
          schemaName: 'ConventionExtraction',
          messages,
          timeoutMs: EXTRACTION_TIMEOUT_MS,
        });
        return { data: res.data, model: res.model };
      },
    },
    samples: container.repoIntel,
  });
}
