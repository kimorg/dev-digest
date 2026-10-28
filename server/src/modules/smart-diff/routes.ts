import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildSmartDiffService } from './wiring.js';

/**
 * Smart-diff module (PR → Files changed).
 *   GET /pulls/:id/smart-diff → files grouped by role + finding lines; DB only, no model or GitHub call
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildSmartDiffService(app.container);

  app.get(
    '/pulls/:id/smart-diff',
    {
      schema: { params: IdParams, response: { 200: SmartDiffResponse } },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
