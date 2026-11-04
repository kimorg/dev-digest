import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildPrHistoryService } from './wiring.js';

/**
 * PR history module (PR → Overview, under the blast radius).
 *   GET /pulls/:id/history → merged PRs that touched the same files (GitHub); never fails on GitHub, answers degraded
 */
export default async function prHistoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // One service per plugin: it owns the in-memory cache.
  const service = buildPrHistoryService(app.container, app.log);

  app.get(
    '/pulls/:id/history',
    {
      schema: { params: IdParams, response: { 200: PrHistory } },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
