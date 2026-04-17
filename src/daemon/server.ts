import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AppiumAgentError } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import type { SessionManager } from './session-manager.js';
import type { ElementRegistry } from './element-registry.js';
import { sessionRoutes } from './routes/session.routes.js';
import { elementRoutes } from './routes/element.routes.js';
import { actionRoutes } from './routes/action.routes.js';

export interface ServerDeps {
  sessionManager: SessionManager;
  elementRegistry: ElementRegistry;
  logger: Logger;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { sessionManager, elementRegistry, logger } = deps;

  const fastify = Fastify({
    logger: false, // we use pino directly
    disableRequestLogging: true,
  });

  // Request logging middleware
  fastify.addHook('onRequest', async (request) => {
    logger.debug({ method: request.method, url: request.url }, 'Incoming request');
  });

  fastify.addHook('onResponse', async (request, reply) => {
    logger.debug(
      { method: request.method, url: request.url, statusCode: reply.statusCode },
      'Request completed',
    );
  });

  // Parse JSON bodies
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Health check
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ ok: true, data: { status: 'ok' } });
  });

  // Graceful shutdown endpoint
  fastify.post('/daemon/shutdown', async (_request, reply) => {
    logger.info('Shutdown requested via HTTP');
    await reply.send({ ok: true, data: { message: 'Shutting down' } });
    // Close session if active before shutdown
    if (sessionManager.isActive()) {
      try {
        await sessionManager.endSession();
      } catch {
        // best effort
      }
    }
    process.exit(0);
  });

  // Global error handler — must be set before registering child-scope routes
  fastify.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppiumAgentError) {
      return reply.status(500).send({
        ok: false,
        error: { code: error.code, message: error.message },
      });
    }

    logger.error({ err: error, url: request.url }, 'Unhandled error');
    return reply.status(500).send({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: process.env['NODE_ENV'] !== 'production' ? (error instanceof Error ? error.message : String(error)) : undefined,
      },
    });
  });

  // Register route plugins
  await fastify.register(async (instance) => {
    await sessionRoutes(instance, { sessionManager, elementRegistry });
    await elementRoutes(instance, { sessionManager, elementRegistry });
    await actionRoutes(instance, { sessionManager, elementRegistry });
  });

  return fastify;
}
