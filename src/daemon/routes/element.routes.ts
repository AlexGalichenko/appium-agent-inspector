import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ElementNotFoundError,
  ElementRefNotFoundError,
  SessionNotActiveError,
} from '../../shared/errors.js';
import { FindElementRequestSchema } from '../../shared/types.js';
import type { SessionManager } from '../session-manager.js';
import type { ElementRegistry } from '../element-registry.js';

export async function elementRoutes(
  fastify: FastifyInstance,
  opts: { sessionManager: SessionManager; elementRegistry: ElementRegistry },
): Promise<void> {
  const { sessionManager, elementRegistry } = opts;

  // POST /elements/find - find and register an element
  fastify.post('/elements/find', async (request, reply) => {
    const parseResult = FindElementRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: z.prettifyError(parseResult.error),
        },
      });
    }

    const { strategy, selector } = parseResult.data;

    try {
      // Verify element exists in current view hierarchy
      await elementRegistry.findElement(strategy, selector, sessionManager);

      const sessionId = sessionManager.getSessionId();
      if (sessionId === null) {
        throw new SessionNotActiveError();
      }

      const ref = elementRegistry.store({ selector, strategy, sessionId });

      return reply.status(201).send({
        ok: true,
        data: {
          elementId: ref.id,
          selector: ref.selector,
          strategy: ref.strategy,
          foundAt: ref.foundAt,
        },
      });
    } catch (err) {
      if (err instanceof SessionNotActiveError) {
        return reply.status(409).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      if (err instanceof ElementNotFoundError) {
        return reply.status(404).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });

  // GET /elements - list all registered element references
  fastify.get('/elements', async (_request, reply) => {
    return reply.send({ ok: true, data: { elements: elementRegistry.list() } });
  });

  // GET /elements/:id - inspect a specific element reference
  fastify.get<{ Params: { id: string } }>('/elements/:id', async (request, reply) => {
    try {
      const ref = elementRegistry.retrieve(request.params.id);
      return reply.send({ ok: true, data: ref });
    } catch (err) {
      if (err instanceof ElementRefNotFoundError) {
        return reply.status(404).send({
          ok: false,
          error: { code: err.code, message: err.message },
        });
      }
      throw err;
    }
  });
}
