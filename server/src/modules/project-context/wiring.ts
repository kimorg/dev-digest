import type { Container } from '../../platform/container.js';
import { ProjectContextRepository } from './repository.js';
import { ProjectContextService } from './service.js';

/** Composition for project-context: the service over its Postgres store and the container's clone reader. */
export function buildProjectContextService(container: Container): ProjectContextService {
  return new ProjectContextService(
    new ProjectContextRepository(container.db),
    container.contextDocSource,
    (text) => container.tokenizer.count(text),
  );
}
