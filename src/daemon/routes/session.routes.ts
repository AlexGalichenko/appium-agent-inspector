import type { FastifyInstance } from 'fastify';
import { ROUTES } from '../../shared/routes.js';
import { on } from './helpers.js';
import type { RouteDeps } from './helpers.js';

export async function sessionRoutes(
  fastify: FastifyInstance,
  { sessionManager }: RouteDeps,
): Promise<void> {
  on(fastify, ROUTES.startSession, async (body, _request, reply) => {
    reply.status(201);
    return sessionManager.startSession(body);
  });

  // Ending the session fires the session-lost handler, which drops the element
  // references along with it.
  on(fastify, ROUTES.endSession, async () => {
    await sessionManager.endSession();
    return { message: 'Session closed' };
  });

  on(fastify, ROUTES.getSessionStatus, async () => {
    const meta = sessionManager.getSessionMeta();
    return meta === null
      ? { active: false as const }
      : { active: true as const, ...meta };
  });

  on(fastify, ROUTES.getContexts, async () => sessionManager.getContexts());

  on(fastify, ROUTES.switchContext, async ({ name }) =>
    sessionManager.switchContext(name),
  );

  on(fastify, ROUTES.getDeviceInfo, async () => sessionManager.getDeviceInfo());
}
