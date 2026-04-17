import type { FastifyInstance } from 'fastify';
import {
  SessionAlreadyActiveError,
  SessionNotActiveError,
} from '../../shared/errors.js';
import { StartSessionRequestSchema } from '../../shared/types.js';
import type { SessionManager } from '../session-manager.js';
import type { ElementRegistry } from '../element-registry.js';

export async function sessionRoutes(
  fastify: FastifyInstance,
  opts: { sessionManager: SessionManager; elementRegistry: ElementRegistry },
): Promise<void> {
  const { sessionManager, elementRegistry } = opts;

  // POST /session - start-app
  fastify.post('/session', async (request, reply) => {
    const parseResult = StartSessionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const result = await sessionManager.startSession(parseResult.data);
      return reply.status(201).send({ ok: true, data: result });
    } catch (err) {
      if (err instanceof SessionAlreadyActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // DELETE /session - close-app
  fastify.delete('/session', async (request, reply) => {
    try {
      await sessionManager.endSession();
      elementRegistry.invalidateAll();
      return reply.send({ ok: true, data: { message: 'Session closed' } });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // GET /session - check session status
  fastify.get('/session', async (_request, reply) => {
    const meta = sessionManager.getSessionMeta();
    if (meta === null) {
      return reply.send({ ok: true, data: { active: false } });
    }
    return reply.send({ ok: true, data: { active: true, ...meta } });
  });
}
