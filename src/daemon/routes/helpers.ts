import { z } from 'zod';
import { ValidationError } from '../../shared/errors.js';
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
  body: unknown,
  { sessionManager, elementRegistry }: RouteDeps,
) {
  const target = body as {
    elementId?: string;
    strategy?: never;
    selector?: string;
    index?: number;
  };

  if (typeof target.elementId === 'string') {
    return elementRegistry.retrieveElement(target.elementId, sessionManager);
  }

  const located = body as {
    strategy: Parameters<ElementRegistry['findElement']>[0];
    selector: string;
    index?: number;
  };

  return elementRegistry.findElement(
    located.strategy,
    located.selector,
    sessionManager,
    located.index ?? 0,
  );
}
