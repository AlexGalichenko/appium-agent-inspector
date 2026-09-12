import { z } from 'zod';
import { ValidationError } from '../../shared/errors.js';
import type { ElementTarget } from '../../shared/types.js';
import type { SessionManager } from '../session-manager.js';
import type { ElementRegistry } from '../element-registry.js';

export interface RouteDeps {
  sessionManager: SessionManager;
  elementRegistry: ElementRegistry;
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
