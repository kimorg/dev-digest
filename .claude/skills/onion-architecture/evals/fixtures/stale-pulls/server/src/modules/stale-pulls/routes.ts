import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, count, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildStalePullsService } from './wiring.js';

const StalePullDto = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  updatedAt: z.string(),
  findingCount: z.number().int(),
});

/**
 *   GET /repos/:id/stale-pulls        → open PRs not updated within the stale window, oldest first
 *   GET /repos/:id/stale-pulls/count  → how many open PRs are older than `days`
 */
export default async function stalePullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildStalePullsService(app.container);

  app.get(
    '/repos/:id/stale-pulls',
    { schema: { params: IdParams, response: { 200: z.array(StalePullDto) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/stale-pulls/count',
    {
      schema: {
        params: IdParams,
        querystring: z.object({ days: z.coerce.number().int().positive().default(14) }),
        response: { 200: z.object({ count: z.number().int() }) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const cutoff = new Date(Date.now() - req.query.days * 86_400_000);
      const [row] = await app.container.db
        .select({ count: count() })
        .from(t.pullRequests)
        .where(
          and(
            eq(t.pullRequests.workspaceId, workspaceId),
            eq(t.pullRequests.repoId, req.params.id),
            eq(t.pullRequests.state, 'open'),
            lt(t.pullRequests.updatedAt, cutoff),
          ),
        );
      return { count: row?.count ?? 0 };
    },
  );
}
