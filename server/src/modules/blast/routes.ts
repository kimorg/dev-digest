import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildBlastService } from './wiring.js';

/**
 * Blast module (PR → Overview).
 *   GET /pulls/:id/blast → changed symbols → callers → endpoints/crons from the repo-intel index; no model or GitHub call
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildBlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    {
      schema: { params: IdParams, response: { 200: BlastRadius } },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { blast, source } = await service.get(workspaceId, req.params.id);
      req.log.info(
        {
          prId: req.params.id,
          source,
          degraded: blast.degraded,
          reason: blast.reason,
          symbols: blast.changed_symbols.length,
          callers: blast.downstream.reduce((n, d) => n + d.callers.length, 0),
        },
        'blast radius read from repo-intel',
      );
      return blast;
    },
  );
}
