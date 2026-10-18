import type { Container } from '../../platform/container.js';
import { SkillRepository } from './repository.js';
import { SkillService } from './service.js';

/** Composition for the skills module: the service over its Postgres store. */
export function buildSkillService(container: Container): SkillService {
  return new SkillService(new SkillRepository(container.db));
}
