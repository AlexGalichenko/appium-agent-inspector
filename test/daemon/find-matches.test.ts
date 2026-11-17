import { describe, expect, it, vi } from 'vitest';
import { ElementNotFoundError, StaleElementError } from '../../src/shared/errors.js';
import { ElementRegistry, findMatches } from '../../src/daemon/element-registry.js';
import { isInView } from '../../src/daemon/routes/action.routes.js';

/**
 * webdriverio 10's find-elements result is a proxy: reading past its end polls
 * the device for seconds and returns a "not found" element instead of
 * undefined. Model that as a throw, so any direct indexing fails the test.
 */
function wdio10Result<T>(items: T[]): T[] {
  return new Proxy(items, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        /^\d+$/.test(prop) &&
        Number(prop) >= target.length
      ) {
        throw new Error(`indexed past the end of a find-elements result: [${prop}]`);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

const driverReturning = (items: unknown[]) =>
  ({
    isAndroid: true,
    $$: vi.fn().mockImplementation(async () => wdio10Result(items)),
  }) as never;

const managerFor = (driver: unknown) =>
  ({ getDriver: () => driver, getSessionId: () => 's1' }) as never;

describe('lookups never index a find-elements result directly', () => {
  it('findMatches copies the result into a plain array', async () => {
    const matches = await findMatches(driverReturning([]), 'id=x');
    expect(matches[0]).toBeUndefined();
  });

  it('isInView treats no match as not in view', async () => {
    await expect(isInView(driverReturning([]), 'id=x')).resolves.toBe(false);
  });

  it('findElement reports a miss as ELEMENT_NOT_FOUND', async () => {
    const registry = new ElementRegistry();
    await expect(
      registry.findElement('id', 'x', managerFor(driverReturning([])), 3),
    ).rejects.toThrow(ElementNotFoundError);
  });

  it('a stored reference whose element is gone is STALE_ELEMENT, not a fake element', async () => {
    const registry = new ElementRegistry();
    const ref = registry.store({ selector: 'x', strategy: 'id', index: 2 });
    await expect(
      registry.retrieveElement(ref.id, managerFor(driverReturning([{}, {}]))),
    ).rejects.toThrow(StaleElementError);
  });
});
