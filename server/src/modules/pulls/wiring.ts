import type { Container } from '../../platform/container.js';
import { PullRepository } from './repository.js';
import { PullService } from './service.js';

/** Composition for the pulls module's DB-only lookups: its Postgres store behind the `PullStore` port. */
export function buildPullService(container: Container): PullService {
  return new PullService(new PullRepository(container.db));
}
