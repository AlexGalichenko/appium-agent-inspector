import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ElementNotFoundError,
  ElementRefNotFoundError,
  StaleElementError,
} from '../../src/shared/errors.js';
import { ElementRegistry } from '../../src/daemon/element-registry.js';
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
      const ref = registry.store({ selector: '~Login', strategy: 'accessibility id', sessionId: 's1' });
      expect(ref.id).toBeTruthy();
      expect(ref.selector).toBe('~Login');
      expect(ref.strategy).toBe('accessibility id');
      expect(ref.sessionId).toBe('s1');
      expect(new Date(ref.foundAt).getTime()).toBeGreaterThan(0);

      expect(registry.retrieve(ref.id)).toEqual(ref);
    });

    it('generates unique IDs for multiple stored refs', () => {
      const a = registry.store({ selector: '~A', strategy: 'accessibility id', sessionId: 's1' });
      const b = registry.store({ selector: '~B', strategy: 'accessibility id', sessionId: 's1' });
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
      const cases: Array<[import('../shared/types.js').LocatorStrategy, string, string]> = [
        ['accessibility id', 'Login', '~Login'],
        ['id', 'btn', 'id=btn'],
        ['-android uiautomator', 'text("OK")', 'android=text("OK")'],
        ['-ios predicate string', 'label == "OK"', 'ios=label == "OK"'],
        ['-ios class chain', '**/XCUIElementTypeButton', 'ios=**/XCUIElementTypeButton'],
        ['xpath', '//button', '//button'],
        ['class name', 'XCUIElementTypeButton', 'XCUIElementTypeButton'],
        ['css selector', '.btn', '.btn'],
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
  });

  // ── retrieveElement ──────────────────────────────────────────────────────

  describe('retrieveElement', () => {
    it('returns the element when it exists', async () => {
      const element = makeElement(true);
      const sm = makeSessionManager(element);
      const ref = registry.store({ selector: '~Login', strategy: 'accessibility id', sessionId: 'sess-1' });

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
      const ref = registry.store({ selector: '~Gone', strategy: 'accessibility id', sessionId: 'sess-1' });

      await expect(registry.retrieveElement(ref.id, sm)).rejects.toThrow(StaleElementError);
    });
  });
});
