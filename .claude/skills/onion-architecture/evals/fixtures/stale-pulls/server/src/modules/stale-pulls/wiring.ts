import type { Container } from '../../platform/container.js';
import { StalePullsService } from './service.js';

export function buildStalePullsService(container: Container): StalePullsService {
  return new StalePullsService(container.db);
}
