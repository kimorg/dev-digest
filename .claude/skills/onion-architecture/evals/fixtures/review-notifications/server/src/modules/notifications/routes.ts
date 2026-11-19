import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { buildNotificationsService, registerNotificationJobs } from './wiring.js';

/**
 *   POST /runs/:id/notify → posts the run's summary to the configured Slack channel
 */
export default async function notificationsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildNotificationsService(app.container);
  registerNotificationJobs(app.container, service);

  app.post(
    '/runs/:id/notify',
    { schema: { params: IdParams, response: { 200: z.object({ sent: z.boolean() }) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.notifyReviewFinished(workspaceId, req.params.id);
    },
  );
}
