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
  }): ElementReference {
    const ref: ElementReference = {
      id: nanoid(),
      selector: opts.selector,
      strategy: opts.strategy,
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
  ) {
    const driver = sessionManager.getDriver();
    try {
      const element = driver.$(toWdioSelector(strategy, selector));
      if (!(await element.isExisting())) {
        throw new ElementNotFoundError(strategy, selector);
      }
      return element;
    } catch (err) {
      if (err instanceof ElementNotFoundError) throw err;
      throw new ElementNotFoundError(strategy, selector);
    }
  }

  async retrieveElement(id: string, sessionManager: SessionManager) {
    const ref = this.retrieve(id);
    const driver = sessionManager.getDriver();
    try {
      const element = driver.$(toWdioSelector(ref.strategy, ref.selector));
      if (!(await element.isExisting())) {
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
function toWdioSelector(strategy: LocatorStrategy, selector: string): string {
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
