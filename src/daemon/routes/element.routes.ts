import type { FastifyInstance } from 'fastify';
import { ElementNotFoundError, WaitTimeoutError } from '../../shared/errors.js';
import { ROUTES } from '../../shared/routes.js';
import type { ElementReference } from '../../shared/types.js';
import { fingerprintOf, toWdioSelector } from '../element-registry.js';
import { ok, on } from './helpers.js';
import type { RouteDeps } from './helpers.js';

export async function elementRoutes(
  fastify: FastifyInstance,
  { sessionManager, elementRegistry }: RouteDeps,
): Promise<void> {
  // Find and register one element, or every match.
  on(fastify, ROUTES.findElement, async (body, _request, reply) => {
    const { strategy, selector, index, all } = body;

    // One lookup answers everything: whether the element exists, how many
    // matches there are, and which one sits at the requested index.
    const matches = await elementRegistry.findAll(strategy, selector, sessionManager);
    if (matches[all ? 0 : index] === undefined) {
      throw new ElementNotFoundError(strategy, selector);
    }

    // References to one of several matches are positional, and positions shift
    // as lists scroll. A fingerprint lets rehydration notice that.
    const positional = matches.length > 1;
    const register = async (i: number) => {
      const fingerprint = positional ? await fingerprintOf(matches[i]!) : undefined;
      const ref = elementRegistry.store({
        selector,
        strategy,
        index: i,
        ...(fingerprint !== undefined && { fingerprint }),
      });
      return { elementId: ref.id, index: ref.index };
    };

    reply.status(201);
    if (!all) return { ...(await register(index)), matchCount: matches.length };

    const elements = [];
    for (let i = 0; i < matches.length; i++) elements.push(await register(i));
    return { matchCount: matches.length, elements };
  });

  // Block until an element reaches a condition.
  on(
    fastify,
    ROUTES.waitForElement,
    async ({ strategy, selector, condition, timeout }) => {
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

      return { waitedMs: Date.now() - startedAt };
    },
  );

  on(fastify, ROUTES.listElements, async () => ({
    elements: elementRegistry.list().map(toPublic),
  }));

  // The only route with a path parameter, so it is not in the shared table.
  fastify.get<{ Params: { id: string } }>('/elements/:id', async (request) =>
    ok(toPublic(elementRegistry.retrieve(request.params.id))),
  );
}

/** The fingerprint is the daemon's bookkeeping; callers never act on it. */
function toPublic(ref: ElementReference): ElementReference {
  const copy = { ...ref };
  delete copy.fingerprint;
  return copy;
}
