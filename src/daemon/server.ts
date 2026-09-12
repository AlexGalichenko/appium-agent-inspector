import Fastify, { LogController } from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { AppiumAgentError, UnauthorizedError } from '../shared/errors.js';
import { DAEMON_TOKEN_HEADER } from '../shared/constants.js';
import type { Logger } from '../shared/logger.js';
import type { SessionManager } from './session-manager.js';
import type { ElementRegistry } from './element-registry.js';
import { fromWebDriverError, isSessionGoneError } from './webdriver-errors.js';
import { sessionRoutes } from './routes/session.routes.js';
import { elementRoutes } from './routes/element.routes.js';
import { actionRoutes } from './routes/action.routes.js';

export interface ServerDeps {
  sessionManager: SessionManager;
  elementRegistry: ElementRegistry;
  logger: Logger;
  /** When set, every route except /health requires this token in a header. */
  token?: string;
  /** Runs the daemon's shutdown sequence; called once the shutdown reply is sent. */
  requestShutdown: (reason: string) => void;
}

/** Routes reachable without the daemon token. */
const PUBLIC_PATHS = new Set(['/health']);

function pathOf(url: string): string {
  return url.split('?')[0] ?? url;
}

function sendError(reply: FastifyReply, error: AppiumAgentError) {
  return reply.status(error.httpStatus).send({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
    },
  });
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { sessionManager, elementRegistry, logger, token, requestShutdown } = deps;

  const fastify = Fastify({
    logger: false, // we use pino directly
    logController: new LogController({ disableRequestLogging: true }),
  });

  if (token !== undefined) {
    fastify.addHook('onRequest', async (request) => {
      if (PUBLIC_PATHS.has(pathOf(request.url))) return;
      if (request.headers[DAEMON_TOKEN_HEADER] !== token) {
        throw new UnauthorizedError();
      }
    });
  }

  // Any authorised request counts as the client still being there, which
  // postpones the session idle timeout.
  fastify.addHook('onRequest', async (request) => {
    if (!PUBLIC_PATHS.has(pathOf(request.url))) sessionManager.touch();
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
      if (!body) {
        done(null, null);
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // Health check — also identifies the service, so a CLI probing a reused port
  // can tell our daemon apart from whatever else is listening.
  fastify.get('/health', async (_request, reply) => {
    return reply.send({
      ok: true,
      data: { status: 'ok', service: 'appium-agent', pid: process.pid },
    });
  });

  // Graceful shutdown endpoint. The shutdown sequence closes this very server,
  // so it only starts once the reply has been flushed.
  fastify.post(
    '/daemon/shutdown',
    {
      onResponse: async () => {
        requestShutdown('HTTP');
      },
    },
    async (_request, reply) => {
      logger.info('Shutdown requested via HTTP');
      return reply.send({ ok: true, data: { message: 'Shutting down' } });
    },
  );

  // Single error handler — every deliberate error carries its own status, so
  // routes never map errors themselves.
  fastify.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppiumAgentError) {
      return sendError(reply, error);
    }

    const mapped = fromWebDriverError(error);
    if (mapped !== null) {
      if (isSessionGoneError(error)) sessionManager.markSessionLost();
      logger.debug({ err: error, url: request.url }, 'WebDriver error');
      return sendError(reply, mapped);
    }

    logger.error({ err: error, url: request.url }, 'Unhandled error');
    return reply.status(500).send({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  });

  // Register route plugins
  await fastify.register(async (instance) => {
    const routeDeps = { sessionManager, elementRegistry };
    await sessionRoutes(instance, routeDeps);
    await elementRoutes(instance, routeDeps);
    await actionRoutes(instance, routeDeps);
  });

  return fastify;
}
