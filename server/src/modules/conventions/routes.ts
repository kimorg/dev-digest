import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SetConventionsStatusRequest, UpdateConventionRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildConventionService } from './wiring.js';

/**
 * Conventions module (L02) — spec: server/specs/004-conventions.md
 *   GET  /repos/:id/conventions             → latest scan + non-rejected candidates
 *   POST /repos/:id/conventions/extract     → run a scan (sync), then the same snapshot
 *   PUT  /conventions/:id                   → accept / reject / inline edit
 *   POST /repos/:id/conventions/set-status  → Accept all / Deselect all
 *   GET  /repos/:id/conventions/skill-draft → accepted candidates as one skill draft
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildConventionService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.list(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Repo not found');
    return result;
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.extract(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Repo not found');
    return result;
  });

  app.put(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionRequest } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const convention = await service.update(workspaceId, req.params.id, req.body);
      if (!convention) throw new NotFoundError('Convention not found');
      return convention;
    },
  );

  app.post(
    '/repos/:id/conventions/set-status',
    { schema: { params: IdParams, body: SetConventionsStatusRequest } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.setStatus(workspaceId, req.params.id, req.body);
      if (!result) throw new NotFoundError('Repo not found');
      return result;
    },
  );

  app.get('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const draft = await service.skillDraft(workspaceId, req.params.id);
    if (!draft) throw new NotFoundError('Repo not found');
    return draft;
  });
}
