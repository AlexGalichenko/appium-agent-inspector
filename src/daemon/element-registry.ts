import { nanoid } from 'nanoid';
import {
  ElementNotFoundError,
  ElementRefNotFoundError,
  StaleElementError,
} from '../shared/errors.js';
import type { ElementReference, LocatorStrategy } from '../shared/types.js';
import type { SessionManager } from './session-manager.js';

export class ElementRegistry {
  private readonly refs = new Map<string, ElementReference>();

  store(opts: {
    selector: string;
    strategy: LocatorStrategy;
    sessionId: string;
    index?: number;
  }): ElementReference {
    const ref: ElementReference = {
      id: nanoid(),
      selector: opts.selector,
      strategy: opts.strategy,
      index: opts.index ?? 0,
      foundAt: new Date().toISOString(),
      sessionId: opts.sessionId,
    };
    this.refs.set(ref.id, ref);
    return ref;
  }

  retrieve(id: string): ElementReference {
    const ref = this.refs.get(id);
    if (ref === undefined) {
      throw new ElementRefNotFoundError(id);
    }
    return ref;
  }

  async findElement(
    strategy: LocatorStrategy,
    selector: string,
    sessionManager: SessionManager,
    index = 0,
  ) {
    const driver = sessionManager.getDriver();
    const wdioSelector = toWdioSelector(strategy, selector);

    try {
      // Index 0 keeps the cheaper single-element path; only an explicitly
      // ambiguous request pays for resolving the whole match list.
      const element =
        index === 0 ? driver.$(wdioSelector) : (await driver.$$(wdioSelector))[index];

      if (element === undefined || !(await element.isExisting())) {
        throw new ElementNotFoundError(strategy, selector);
      }
      return element;
    } catch (err) {
      if (err instanceof ElementNotFoundError) throw err;
      throw new ElementNotFoundError(strategy, selector);
    }
  }

  /** Number of elements the selector currently matches — 0 when none. */
  async countMatches(
    strategy: LocatorStrategy,
    selector: string,
    sessionManager: SessionManager,
  ): Promise<number> {
    const driver = sessionManager.getDriver();
    try {
      const elements = await driver.$$(toWdioSelector(strategy, selector));
      return elements.length;
    } catch {
      return 0;
    }
  }

  async retrieveElement(id: string, sessionManager: SessionManager) {
    const ref = this.retrieve(id);
    const driver = sessionManager.getDriver();
    const wdioSelector = toWdioSelector(ref.strategy, ref.selector);

    try {
      const element =
        ref.index === 0
          ? driver.$(wdioSelector)
          : (await driver.$$(wdioSelector))[ref.index];

      if (element === undefined || !(await element.isExisting())) {
        throw new StaleElementError(id, ref.selector);
      }
      return element;
    } catch (err) {
      if (err instanceof StaleElementError) throw err;
      if (err instanceof ElementRefNotFoundError) throw err;
      throw new StaleElementError(id, ref.selector);
    }
  }

  invalidateAll(): void {
    this.refs.clear();
  }

  list(): ElementReference[] {
    return Array.from(this.refs.values());
  }
}

/**
 * Converts a strategy + selector into the format webdriverio's $() accepts.
 */
export function toWdioSelector(strategy: LocatorStrategy, selector: string): string {
  switch (strategy) {
    case 'accessibility id':
      return `~${selector}`;
    case 'id':
      return `id=${selector}`;
    case '-android uiautomator':
      return `android=${selector}`;
    case '-ios predicate string':
      return `ios=${selector}`;
    case '-ios class chain':
      return `ios=${selector}`;
    case 'xpath':
    case 'class name':
    case 'css selector':
      return selector;
    default:
      return selector;
  }
}
