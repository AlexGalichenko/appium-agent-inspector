import { timingSafeEqual } from 'node:crypto';
import Fastify, { LogController } from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  AppiumAgentError,
  UnauthorizedError,
  ValidationError,
} from '../shared/errors.js';
import { DAEMON_TOKEN_HEADER } from '../shared/constants.js';
import { ROUTES } from '../shared/routes.js';
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

/**
 * Compares the presented token against the real one without leaking its
 * contents through timing. `timingSafeEqual` throws on a length mismatch, so
 * the lengths are compared first — a token's length is not a secret.
 */
function tokenMatches(presented: unknown, expected: string): boolean {
  if (typeof presented !== 'string') return false;
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function statusCodeOf(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object' || !('statusCode' in error)) {
    return undefined;
  }
  const { statusCode } = error;
  return typeof statusCode === 'number' ? statusCode : undefined;
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

  // Stored element references are only meaningful within a session, so every
  // way a session ends — delete, heartbeat failure, Appium dropping it — clears them.
  sessionManager.setSessionLostHandler(() => elementRegistry.invalidateAll());

  const fastify = Fastify({
    logger: false, // we use pino directly
    logController: new LogController({ disableRequestLogging: true }),
  });

  if (token !== undefined) {
    fastify.addHook('onRequest', async (request) => {
      if (PUBLIC_PATHS.has(pathOf(request.url))) return;
      if (!tokenMatches(request.headers[DAEMON_TOKEN_HEADER], token)) {
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
      } catch {
        done(new ValidationError('Request body is not valid JSON'), undefined);
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
    ROUTES.shutdown.path,
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

  // A daemon that predates the CLI lacks its newer routes. Fastify's default
  // 404 body is not our envelope, so the CLI could not explain it.
  fastify.setNotFoundHandler(async (request, reply) => {
    return sendError(
      reply,
      new AppiumAgentError(
        'ROUTE_NOT_FOUND',
        `The daemon has no route ${request.method} ${pathOf(request.url)}. It may be older than this CLI — restart it with: appium-agent daemon:kill && appium-agent daemon:start`,
        404,
      ),
    );
  });

  // Single error handler — every deliberate error carries its own status, so
  // routes never map errors themselves.
  fastify.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppiumAgentError) {
      return sendError(reply, error);
    }

    const mapped = fromWebDriverError(error);
    if (mapped !== null) {
      if (isSessionGoneError(error)) sessionManager.markSessionLost();
      // An element miss is routine; a driver refusing a command is worth seeing.
      if (mapped.code === 'DRIVER_ERROR') {
        logger.warn({ err: error, url: request.url }, 'Driver error');
      } else {
        logger.debug({ err: error, url: request.url }, 'WebDriver error');
      }
      return sendError(reply, mapped);
    }

    // Fastify's own request errors (body too large, bad content type) carry a
    // 4xx status. They are the caller's fault, not an internal failure.
    const status = statusCodeOf(error);
    if (status !== undefined && status >= 400 && status < 500) {
      return sendError(
        reply,
        new AppiumAgentError(
          'BAD_REQUEST',
          error instanceof Error ? error.message : String(error),
          status,
        ),
      );
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
