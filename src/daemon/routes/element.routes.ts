import type { FastifyInstance } from 'fastify';
import { SessionNotActiveError, WaitTimeoutError } from '../../shared/errors.js';
import { FindElementRequestSchema, WaitRequestSchema } from '../../shared/types.js';
import type {
  FindElementResponse,
  FindElementsResponse,
  WaitResponse,
} from '../../shared/types.js';
import { toWdioSelector } from '../element-registry.js';
import { parseBody } from './helpers.js';
import type { RouteDeps } from './helpers.js';

export async function elementRoutes(
  fastify: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  const { sessionManager, elementRegistry } = deps;

  // POST /elements/find - find and register one element (or all matches)
  fastify.post('/elements/find', async (request, reply) => {
    const { strategy, selector, index, all } = parseBody(
      FindElementRequestSchema,
      request.body,
    );

    // Verify the element is really in the current view hierarchy before storing
    // a reference for it.
    await elementRegistry.findElement(strategy, selector, sessionManager, index);

    const sessionId = sessionManager.getSessionId();
    if (sessionId === null) {
      throw new SessionNotActiveError();
    }

    const matchCount = await elementRegistry.countMatches(
      strategy,
      selector,
      sessionManager,
    );

    if (all) {
      const elements: FindElementResponse[] = [];
      for (let i = 0; i < matchCount; i++) {
        const ref = elementRegistry.store({ selector, strategy, sessionId, index: i });
        elements.push(toFindResponse(ref, matchCount));
      }
      const data: FindElementsResponse = { matchCount, elements };
      return reply.status(201).send({ ok: true, data });
    }

    const ref = elementRegistry.store({ selector, strategy, sessionId, index });
    return reply.status(201).send({ ok: true, data: toFindResponse(ref, matchCount) });
  });

  // POST /elements/wait - block until an element reaches a condition
  fastify.post('/elements/wait', async (request, reply) => {
    const { strategy, selector, condition, timeout } = parseBody(
      WaitRequestSchema,
      request.body,
    );

    const driver = sessionManager.getDriver();
    const element = driver.$(toWdioSelector(strategy, selector));
    const startedAt = Date.now();

    try {
      switch (condition) {
        case 'existing':
          await element.waitForExist({ timeout });
          break;
        case 'displayed':
          await element.waitForDisplayed({ timeout });
          break;
        case 'enabled':
          await element.waitForEnabled({ timeout });
          break;
        case 'gone':
          await element.waitForExist({ timeout, reverse: true });
          break;
      }
    } catch {
      throw new WaitTimeoutError(condition, selector, timeout);
    }

    const data: WaitResponse = { condition, selector, waitedMs: Date.now() - startedAt };
    return reply.send({ ok: true, data });
  });

  // GET /elements - list all registered element references
  fastify.get('/elements', async (_request, reply) => {
    return reply.send({ ok: true, data: { elements: elementRegistry.list() } });
  });

  // GET /elements/:id - inspect a specific element reference
  fastify.get<{ Params: { id: string } }>('/elements/:id', async (request, reply) => {
    const ref = elementRegistry.retrieve(request.params.id);
    return reply.send({ ok: true, data: ref });
  });
}

function toFindResponse(
  ref: {
    id: string;
    selector: string;
    strategy: FindElementResponse['strategy'];
    index: number;
    foundAt: string;
  },
  matchCount: number,
): FindElementResponse {
  return {
    elementId: ref.id,
    selector: ref.selector,
    strategy: ref.strategy,
    index: ref.index,
    foundAt: ref.foundAt,
    matchCount,
  };
}
