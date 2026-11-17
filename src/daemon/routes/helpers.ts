import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from '../../shared/errors.js';
import type { Route, RouteBody, RouteResponse } from '../../shared/routes.js';
import type { ElementTarget, OkResponse } from '../../shared/types.js';
import type { SessionManager } from '../session-manager.js';
import type { ElementRegistry } from '../element-registry.js';

export interface RouteDeps {
  sessionManager: SessionManager;
  elementRegistry: ElementRegistry;
}

/**
 * Registers a route from the shared table. Its method, path and body schema
 * come from there, so the handler only receives the validated body and
 * returns the data that goes inside the `{ ok: true, data }` envelope.
 */
export function on<R extends Route<z.ZodType | undefined, unknown>>(
  fastify: FastifyInstance,
  route: R,
  handler: (
    body: RouteBody<R>,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<RouteResponse<R>>,
): void {
  fastify.route({
    method: route.method,
    url: route.path,
    handler: async (request, reply) => {
      const body = (
        route.body === undefined ? undefined : parseBody(route.body, request.body)
      ) as RouteBody<R>;
      return ok(await handler(body, request, reply));
    },
  });
}

/** Wraps a route's result in the success envelope every response shares. */
export function ok<T>(data: T): OkResponse<T> {
  return { ok: true, data };
}

/**
 * Validates a request body, throwing a ValidationError the daemon's single
 * error handler turns into a 400. Routes therefore need no per-route
 * validation branch and no try/catch at all.
 */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', z.prettifyError(result.error));
  }
  return result.data;
}

/** Resolves either `{ elementId }` or `{ strategy, selector, index }` to a live element. */
export async function resolveElement(
  target: ElementTarget,
  { sessionManager, elementRegistry }: RouteDeps,
) {
  if ('elementId' in target) {
    return elementRegistry.retrieveElement(target.elementId, sessionManager);
  }
  return elementRegistry.findElement(
    target.strategy,
    target.selector,
    sessionManager,
    target.index,
  );
}
