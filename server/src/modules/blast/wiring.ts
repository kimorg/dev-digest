import type { Container } from '../../platform/container.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';

/** Composition for the blast module: its Postgres store plus the repo-intel facade as the index. */
export function buildBlastService(container: Container): BlastService {
  return new BlastService({ store: new BlastRepository(container.db), index: container.repoIntel });
}
