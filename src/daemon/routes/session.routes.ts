import type { FastifyInstance } from 'fastify';
import {
  StartSessionRequestSchema,
  SwitchContextRequestSchema,
} from '../../shared/types.js';
import { parseBody } from './helpers.js';
import type { RouteDeps } from './helpers.js';

export async function sessionRoutes(
  fastify: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  const { sessionManager, elementRegistry } = deps;

  // POST /session - connect
  fastify.post('/session', async (request, reply) => {
    const body = parseBody(StartSessionRequestSchema, request.body);
    const result = await sessionManager.startSession(body);
    return reply.status(201).send({ ok: true, data: result });
  });

  // DELETE /session - end the session
  fastify.delete('/session', async (_request, reply) => {
    await sessionManager.endSession();
    elementRegistry.invalidateAll();
    return reply.send({ ok: true, data: { message: 'Session closed' } });
  });

  // GET /session - check session status
  fastify.get('/session', async (_request, reply) => {
    const meta = sessionManager.getSessionMeta();
    if (meta === null) {
      return reply.send({ ok: true, data: { active: false } });
    }
    return reply.send({ ok: true, data: { active: true, ...meta } });
  });

  // GET /session/contexts - list native / webview contexts
  fastify.get('/session/contexts', async (_request, reply) => {
    const data = await sessionManager.getContexts();
    return reply.send({ ok: true, data });
  });

  // POST /session/context - switch context
  fastify.post('/session/context', async (request, reply) => {
    const { name } = parseBody(SwitchContextRequestSchema, request.body);
    const data = await sessionManager.switchContext(name);
    return reply.send({ ok: true, data });
  });

  // GET /session/device - screen size, orientation, platform
  fastify.get('/session/device', async (_request, reply) => {
    const data = await sessionManager.getDeviceInfo();
    return reply.send({ ok: true, data });
  });
}
