import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefView } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildBriefService } from './wiring.js';

/**
 * Brief module (PR → Overview "PR brief" block).
 *   GET  /pulls/:id/brief → stored brief + `stale`; never calls a model or GitHub
 *   POST /pulls/:id/brief → regenerate with one model call and store it
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // One service per plugin: it owns the single-flight map.
  const service = buildBriefService(app.container, app.log);

  app.get(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefView } },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefView } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id);
    },
  );
}
