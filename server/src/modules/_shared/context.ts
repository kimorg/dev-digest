import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export interface RequestContext {
  workspaceId: string;
  userId: string;
  /** Fastify request id — lets a service log line be traced back to its HTTP request. */
  requestId: string;
}

/**
 * Resolve the tenancy context for a request via the AuthProvider. In MVP
 * (LocalNoAuthProvider) this always returns the default workspace + system user.
 * Every module uses this so workspace scoping is never forgotten. The request
 * id rides along so services can correlate their logs with the access log.
 */
export async function getContext(
  container: Container,
  req: FastifyRequest,
): Promise<RequestContext> {
  const [user, workspace] = await Promise.all([
    container.auth.currentUser(req),
    container.auth.currentWorkspace(req),
  ]);
  return { workspaceId: workspace.id, userId: user.id, requestId: req.id };
}
