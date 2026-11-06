import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentContextQuery,
  AgentContextResult,
  ContextFileQuery,
  ContextFileResult,
  ContextListResult,
  ContextPathsResult,
  SetContextPathsRequest,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RESCAN_RATE_LIMIT } from './constants.js';
import { buildProjectContextService } from './wiring.js';

/**
 * Project context (SPEC-005)
 *   GET  /repos/:id/context            → docs of the repo clone (lazy first scan)
 *   POST /repos/:id/context/rescan     → rescan the clone (10/min)
 *   GET  /repos/:id/context/file?path= → one doc's content
 *   GET|PUT /agents/:id/context        → attachments (GET ?include=skills adds the skills' paths)
 *   GET|PUT /skills/:id/context        → attachments
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = buildProjectContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextListResult } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/context/rescan',
    {
      schema: { params: IdParams, response: { 200: ContextListResult } },
      config: { rateLimit: RESCAN_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.rescan(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    {
      schema: {
        params: IdParams,
        querystring: ContextFileQuery,
        response: { 200: ContextFileResult },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getFile(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: AgentContextQuery,
        response: { 200: AgentContextResult },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getAgentContext(workspaceId, req.params.id, {
        includeSkills: req.query.include === 'skills',
      });
    },
  );

  app.put(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        body: SetContextPathsRequest,
        response: { 200: ContextPathsResult },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setAgentContext(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, response: { 200: ContextPathsResult } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getSkillContext(workspaceId, req.params.id);
    },
  );

  app.put(
    '/skills/:id/context',
    {
      schema: {
        params: IdParams,
        body: SetContextPathsRequest,
        response: { 200: ContextPathsResult },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setSkillContext(workspaceId, req.params.id, req.body.paths);
    },
  );
}
