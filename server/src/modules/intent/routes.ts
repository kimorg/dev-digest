import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentResult, PrIntentView } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Intent module (PR → Overview "Intent" card).
 *   GET  /pulls/:id/intent              → stored intent + `stale`; never calls a model
 *   POST /pulls/:id/intent/recalculate  → regenerate if the PR/model changed, else reuse
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntentView } },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.prIntent.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent/recalculate',
    {
      schema: { params: IdParams, response: { 200: PrIntentResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { result } = await app.container.prIntent.ensure(workspaceId, req.params.id);
      return result;
    },
  );
}
