import type { FastifyInstance } from 'fastify';
import { SessionNotActiveError, WaitTimeoutError } from '../../shared/errors.js';
import { FindElementRequestSchema, WaitRequestSchema } from '../../shared/types.js';
import type {
  ElementReference,
  FindElementResponse,
  FindElementsResponse,
  WaitResponse,
} from '../../shared/types.js';
import { fingerprintOf, toWdioSelector } from '../element-registry.js';
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
    const element = await elementRegistry.findElement(
      strategy,
      selector,
      sessionManager,
      index,
    );

    const sessionId = sessionManager.getSessionId();
    if (sessionId === null) {
      throw new SessionNotActiveError();
    }

    // References to one of several matches are positional, and positions shift
    // as lists scroll. A fingerprint lets rehydration notice that.
    if (all) {
      const matches = await elementRegistry.findAll(strategy, selector, sessionManager);
      const positional = matches.length > 1;
      const elements: FindElementResponse[] = [];
      for (let i = 0; i < matches.length; i++) {
        const fingerprint = positional ? await fingerprintOf(matches[i]!) : undefined;
        const ref = elementRegistry.store({
          selector,
          strategy,
          sessionId,
          index: i,
          ...(fingerprint !== undefined && { fingerprint }),
        });
        elements.push(toFindResponse(ref, matches.length));
      }
      const data: FindElementsResponse = { matchCount: matches.length, elements };
      return reply.status(201).send({ ok: true, data });
    }

    const matchCount = await elementRegistry.countMatches(
      strategy,
      selector,
      sessionManager,
    );
    const fingerprint = matchCount > 1 ? await fingerprintOf(element) : undefined;
    const ref = elementRegistry.store({
      selector,
      strategy,
      sessionId,
      index,
      ...(fingerprint !== undefined && { fingerprint }),
    });
    return reply.status(201).send({ ok: true, data: toFindResponse(ref, matchCount) });
  });

  // POST /elements/wait - block until an element reaches a condition
  fastify.post('/elements/wait', async (request, reply) => {
    const { strategy, selector, condition, timeout } = parseBody(
      WaitRequestSchema,
      request.body,
    );

    const wdioSelector = toWdioSelector(strategy, selector);
    const startedAt = Date.now();

    // wdio polls the condition; under the implicit wait a single poll for an
    // absent element can outlast the whole requested timeout.
    await sessionManager.withoutImplicitWait(async (driver) => {
      const element = driver.$(wdioSelector);
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
    });

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

function toFindResponse(ref: ElementReference, matchCount: number): FindElementResponse {
  return {
    elementId: ref.id,
    selector: ref.selector,
    strategy: ref.strategy,
    index: ref.index,
    foundAt: ref.foundAt,
    matchCount,
  };
}
