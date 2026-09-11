import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ElementNotFoundError,
  ElementRefNotFoundError,
  StaleElementError,
  ValidationError,
} from '../../src/shared/errors.js';
import { ElementRegistry, toWdioSelector } from '../../src/daemon/element-registry.js';
import type { SessionManager } from '../../src/daemon/session-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(exists: boolean): WebdriverIO.Element {
  return {
    isExisting: vi.fn().mockResolvedValue(exists),
    click: vi.fn().mockResolvedValue(undefined),
    setValue: vi.fn().mockResolvedValue(undefined),
    clearValue: vi.fn().mockResolvedValue(undefined),
  } as unknown as WebdriverIO.Element;
}

function makeDriver(element: WebdriverIO.Element) {
  return { $: vi.fn().mockReturnValue(element) } as unknown as ReturnType<
    SessionManager['getDriver']
  >;
}

function makeSessionManager(element: WebdriverIO.Element, sessionId = 'sess-1') {
  const driver = makeDriver(element);
  return {
    getDriver: vi.fn().mockReturnValue(driver),
    getSessionId: vi.fn().mockReturnValue(sessionId),
    isActive: vi.fn().mockReturnValue(true),
  } as unknown as SessionManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ElementRegistry', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  // ── store / retrieve / list / invalidateAll ─────────────────────────────

  describe('store and retrieve', () => {
    it('stores a ref and returns it from retrieve()', () => {
      const ref = registry.store({
        selector: '~Login',
        strategy: 'accessibility id',
        sessionId: 's1',
      });
      expect(ref.id).toBeTruthy();
      expect(ref.selector).toBe('~Login');
      expect(ref.strategy).toBe('accessibility id');
      expect(ref.sessionId).toBe('s1');
      expect(new Date(ref.foundAt).getTime()).toBeGreaterThan(0);

      expect(registry.retrieve(ref.id)).toEqual(ref);
    });

    it('generates unique IDs for multiple stored refs', () => {
      const a = registry.store({
        selector: '~A',
        strategy: 'accessibility id',
        sessionId: 's1',
      });
      const b = registry.store({
        selector: '~B',
        strategy: 'accessibility id',
        sessionId: 's1',
      });
      expect(a.id).not.toBe(b.id);
    });

    it('throws ElementRefNotFoundError for unknown id', () => {
      expect(() => registry.retrieve('ghost-id')).toThrow(ElementRefNotFoundError);
    });
  });

  describe('list', () => {
    it('returns empty array when no refs stored', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all stored refs', () => {
      registry.store({ selector: '~A', strategy: 'accessibility id', sessionId: 's1' });
      registry.store({ selector: '//btn', strategy: 'xpath', sessionId: 's1' });
      expect(registry.list()).toHaveLength(2);
    });
  });

  describe('invalidateAll', () => {
    it('clears all stored refs', () => {
      registry.store({ selector: '~A', strategy: 'accessibility id', sessionId: 's1' });
      registry.invalidateAll();
      expect(registry.list()).toEqual([]);
    });
  });

  // ── findElement ──────────────────────────────────────────────────────────

  describe('findElement', () => {
    it('returns element when it exists', async () => {
      const element = makeElement(true);
      const sm = makeSessionManager(element);
      const result = await registry.findElement('accessibility id', 'Login', sm);
      expect(result).toBe(element);
    });

    it('throws ElementNotFoundError when element does not exist', async () => {
      const element = makeElement(false);
      const sm = makeSessionManager(element);
      await expect(registry.findElement('xpath', '//btn', sm)).rejects.toThrow(
        ElementNotFoundError,
      );
    });

    it('calls driver.$() with the correct selector for each strategy', async () => {
      const cases: Array<
        [import('../../src/shared/types.js').LocatorStrategy, string, string]
      > = [
        ['accessibility id', 'Login', '~Login'],
        ['id', 'btn', 'id=btn'],
        ['-android uiautomator', 'text("OK")', 'android=text("OK")'],
        ['-ios predicate string', 'label == "OK"', '-ios predicate string:label == "OK"'],
        [
          '-ios class chain',
          '**/XCUIElementTypeButton',
          '-ios class chain:**/XCUIElementTypeButton',
        ],
        ['xpath', '//button', 'xpath://button'],
        [
          'class name',
          'androidx.recyclerview.widget.RecyclerView',
          'class name:androidx.recyclerview.widget.RecyclerView',
        ],
        ['css selector', '.btn', 'css selector:.btn'],
      ];

      for (const [strategy, selector, expected] of cases) {
        const element = makeElement(true);
        const driver = makeDriver(element);
        const sm = {
          getDriver: vi.fn().mockReturnValue(driver),
          getSessionId: vi.fn().mockReturnValue('s1'),
        } as unknown as SessionManager;

        await registry.findElement(strategy, selector, sm);
        expect(driver.$).toHaveBeenCalledWith(expected);
      }
    });

    it('rejects a line break that the explicit strategy form would truncate at', () => {
      expect(() => toWdioSelector('xpath', '//a\n/b')).toThrow(ValidationError);
      expect(() => toWdioSelector('-ios predicate string', 'a == 1\r\n')).toThrow(
        ValidationError,
      );
    });

    it('keeps line breaks for prefix forms, which pass the whole value on', () => {
      expect(toWdioSelector('accessibility id', 'Line one\nLine two')).toBe(
        '~Line one\nLine two',
      );
    });
  });

  // ── retrieveElement ──────────────────────────────────────────────────────

  describe('retrieveElement', () => {
    it('returns the element when it exists', async () => {
      const element = makeElement(true);
      const sm = makeSessionManager(element);
      const ref = registry.store({
        selector: '~Login',
        strategy: 'accessibility id',
        sessionId: 'sess-1',
      });

      const result = await registry.retrieveElement(ref.id, sm);
      expect(result).toBe(element);
    });

    it('throws ElementRefNotFoundError for unknown id', async () => {
      const element = makeElement(true);
      const sm = makeSessionManager(element);
      await expect(registry.retrieveElement('ghost', sm)).rejects.toThrow(
        ElementRefNotFoundError,
      );
    });

    it('throws StaleElementError when element no longer exists', async () => {
      const element = makeElement(false);
      const sm = makeSessionManager(element);
      const ref = registry.store({
        selector: '~Gone',
        strategy: 'accessibility id',
        sessionId: 'sess-1',
      });

      await expect(registry.retrieveElement(ref.id, sm)).rejects.toThrow(
        StaleElementError,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Ambiguous selectors — index lets callers reach matches beyond the first.
// ---------------------------------------------------------------------------

describe('ElementRegistry with ambiguous selectors', () => {
  function makeManager(elements: unknown[]) {
    const driver = {
      $: vi.fn().mockReturnValue(elements[0]),
      $$: vi.fn().mockResolvedValue(elements),
    };
    return { getDriver: () => driver, driver } as never as {
      getDriver: () => typeof driver;
      driver: typeof driver;
    };
  }

  const existing = () => ({ isExisting: vi.fn().mockResolvedValue(true) });

  it('defaults to index 0 when storing a reference', () => {
    const registry = new ElementRegistry();
    const ref = registry.store({
      selector: 'Cell',
      strategy: 'class name',
      sessionId: 's1',
    });
    expect(ref.index).toBe(0);
  });

  it('records the requested index', () => {
    const registry = new ElementRegistry();
    const ref = registry.store({
      selector: 'Cell',
      strategy: 'class name',
      sessionId: 's1',
      index: 2,
    });
    expect(ref.index).toBe(2);
  });

  it('uses the single-element lookup for index 0', async () => {
    const registry = new ElementRegistry();
    const manager = makeManager([existing()]);
    await registry.findElement('class name', 'Cell', manager as never, 0);
    expect(manager.driver.$).toHaveBeenCalled();
    expect(manager.driver.$$).not.toHaveBeenCalled();
  });

  it('resolves the match list for a non-zero index', async () => {
    const registry = new ElementRegistry();
    const wanted = existing();
    const manager = makeManager([existing(), existing(), wanted]);
    const element = await registry.findElement('class name', 'Cell', manager as never, 2);
    expect(manager.driver.$$).toHaveBeenCalled();
    expect(element).toBe(wanted);
  });

  it('reports not-found when the index is past the last match', async () => {
    const registry = new ElementRegistry();
    const manager = makeManager([existing(), existing()]);
    await expect(
      registry.findElement('class name', 'Cell', manager as never, 5),
    ).rejects.toThrow(ElementNotFoundError);
  });

  it('rehydrates a stored reference at its own index', async () => {
    const registry = new ElementRegistry();
    const wanted = existing();
    const manager = makeManager([existing(), wanted]);
    const ref = registry.store({
      selector: 'Cell',
      strategy: 'class name',
      sessionId: 's1',
      index: 1,
    });
    await expect(registry.retrieveElement(ref.id, manager as never)).resolves.toBe(
      wanted,
    );
  });

  it('treats a vanished indexed match as stale', async () => {
    const registry = new ElementRegistry();
    const manager = makeManager([existing()]);
    const ref = registry.store({
      selector: 'Cell',
      strategy: 'class name',
      sessionId: 's1',
      index: 3,
    });
    await expect(registry.retrieveElement(ref.id, manager as never)).rejects.toThrow(
      StaleElementError,
    );
  });

  it('counts how many elements a selector matches', async () => {
    const registry = new ElementRegistry();
    const manager = makeManager([existing(), existing(), existing()]);
    await expect(
      registry.countMatches('class name', 'Cell', manager as never),
    ).resolves.toBe(3);
  });

  it('counts zero rather than throwing when the lookup fails', async () => {
    const registry = new ElementRegistry();
    const manager = {
      getDriver: () => ({
        $$: vi.fn().mockRejectedValue(new Error('no session')),
      }),
    };
    await expect(
      registry.countMatches('class name', 'Cell', manager as never),
    ).resolves.toBe(0);
  });

  it('returns every current match from findAll', async () => {
    const registry = new ElementRegistry();
    const matches = [existing(), existing()];
    const manager = makeManager(matches);
    await expect(
      registry.findAll('class name', 'Cell', manager as never),
    ).resolves.toEqual(matches);
  });
});

// ---------------------------------------------------------------------------
// Positional references — list positions shift as content scrolls or updates,
// so a reference must never silently act on whatever now sits at its index.
// ---------------------------------------------------------------------------

describe('ElementRegistry positional references', () => {
  const cell = (text: string) => ({
    isExisting: vi.fn().mockResolvedValue(true),
    getText: vi.fn().mockResolvedValue(text),
  });

  function managerWith(elements: unknown[]) {
    return {
      getDriver: () => ({
        $: vi.fn().mockReturnValue(elements[0]),
        $$: vi.fn().mockResolvedValue(elements),
      }),
    } as never;
  }

  function storeAt(registry: ElementRegistry, index: number, fingerprint: string) {
    return registry.store({
      selector: 'Cell',
      strategy: 'class name',
      sessionId: 's1',
      index,
      fingerprint,
    });
  }

  it('records a fingerprint only when one is given', () => {
    const registry = new ElementRegistry();
    expect(storeAt(registry, 1, 'Beta').fingerprint).toBe('Beta');
    expect(
      registry.store({ selector: 'Cell', strategy: 'class name', sessionId: 's1' }),
    ).not.toHaveProperty('fingerprint');
  });

  it('returns the element at its index while the fingerprint still matches', async () => {
    const registry = new ElementRegistry();
    const beta = cell('Beta');
    const ref = storeAt(registry, 1, 'Beta');

    await expect(
      registry.retrieveElement(ref.id, managerWith([cell('Alpha'), beta])),
    ).resolves.toBe(beta);
  });

  it('follows the element to its new position after the list shifts', async () => {
    const registry = new ElementRegistry();
    const beta = cell('Beta');
    const ref = storeAt(registry, 1, 'Beta');

    // A row was inserted above: "Beta" moved from index 1 to 2.
    await expect(
      registry.retrieveElement(ref.id, managerWith([cell('New'), cell('Alpha'), beta])),
    ).resolves.toBe(beta);
    expect(registry.retrieve(ref.id).index).toBe(2);
  });

  it('reports stale instead of acting on a different element at the same index', async () => {
    const registry = new ElementRegistry();
    const ref = storeAt(registry, 1, 'Beta');

    await expect(
      registry.retrieveElement(ref.id, managerWith([cell('Gamma'), cell('Delta')])),
    ).rejects.toThrow(StaleElementError);
  });

  it('reports stale when several other matches carry the fingerprint', async () => {
    const registry = new ElementRegistry();
    const ref = storeAt(registry, 0, 'Beta');

    await expect(
      registry.retrieveElement(
        ref.id,
        managerWith([cell('Alpha'), cell('Beta'), cell('Beta')]),
      ),
    ).rejects.toThrow(StaleElementError);
  });
});
