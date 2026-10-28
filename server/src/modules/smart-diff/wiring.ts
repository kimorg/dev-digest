import type { Container } from '../../platform/container.js';
import { SmartDiffRepository } from './repository.js';
import { SmartDiffService } from './service.js';

/** Composition for the smart-diff module: its Postgres store behind the `SmartDiffStore` port. */
export function buildSmartDiffService(container: Container): SmartDiffService {
  return new SmartDiffService(new SmartDiffRepository(container.db));
}
