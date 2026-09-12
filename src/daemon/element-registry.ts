import { nanoid } from 'nanoid';
import {
  ElementNotFoundError,
  ElementRefNotFoundError,
  StaleElementError,
  ValidationError,
} from '../shared/errors.js';
import type { ElementReference, LocatorStrategy } from '../shared/types.js';
import type { Driver, SessionManager } from './session-manager.js';

export class ElementRegistry {
  private readonly refs = new Map<string, ElementReference>();

  store(opts: {
    selector: string;
    strategy: LocatorStrategy;
    sessionId: string;
    index?: number;
    fingerprint?: string;
  }): ElementReference {
    const ref: ElementReference = {
      id: nanoid(),
      selector: opts.selector,
      strategy: opts.strategy,
      index: opts.index ?? 0,
      foundAt: new Date().toISOString(),
      sessionId: opts.sessionId,
      ...(opts.fingerprint !== undefined && { fingerprint: opts.fingerprint }),
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
  ): Promise<WebdriverIO.Element> {
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
      // A lazy $() element is a thenable resolving to the element, which wdio's
      // types do not express. Awaiting here keeps a failed fetch in this catch.
      return await (element as unknown as WebdriverIO.Element);
    } catch (err) {
      if (err instanceof ElementNotFoundError) throw err;
      throw new ElementNotFoundError(strategy, selector);
    }
  }

  /** Every element the selector currently matches — empty when none. */
  async findAll(
    strategy: LocatorStrategy,
    selector: string,
    sessionManager: SessionManager,
  ): Promise<WebdriverIO.Element[]> {
    const driver = sessionManager.getDriver();
    const wdioSelector = toWdioSelector(strategy, selector);
    try {
      return Array.from(await driver.$$(wdioSelector));
    } catch {
      return [];
    }
  }

  /** Number of elements the selector currently matches — 0 when none. */
  async countMatches(
    strategy: LocatorStrategy,
    selector: string,
    sessionManager: SessionManager,
  ): Promise<number> {
    return (await this.findAll(strategy, selector, sessionManager)).length;
  }

  async retrieveElement(
    id: string,
    sessionManager: SessionManager,
  ): Promise<WebdriverIO.Element> {
    const ref = this.retrieve(id);
    const driver = sessionManager.getDriver();
    const wdioSelector = toWdioSelector(ref.strategy, ref.selector);

    try {
      if (ref.fingerprint !== undefined) {
        return await rehydratePositional(ref, ref.fingerprint, driver, wdioSelector);
      }

      const element =
        ref.index === 0
          ? driver.$(wdioSelector)
          : (await driver.$$(wdioSelector))[ref.index];

      if (element === undefined || !(await element.isExisting())) {
        throw new StaleElementError(id, ref.selector);
      }
      return await (element as unknown as WebdriverIO.Element);
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
 * A positional reference is only trusted while the element at its index still
 * carries the text it had when found. Otherwise the list has shifted: follow
 * the element to its new position when exactly one match carries that text,
 * and report it stale rather than act on whatever now sits at the old index.
 */
async function rehydratePositional(
  ref: ElementReference,
  fingerprint: string,
  driver: Driver,
  wdioSelector: string,
): Promise<WebdriverIO.Element> {
  const matches = Array.from(await driver.$$(wdioSelector));

  const atIndex = matches[ref.index];
  if (atIndex !== undefined && (await fingerprintOf(atIndex)) === fingerprint) {
    return atIndex;
  }

  const moved: number[] = [];
  for (let i = 0; i < matches.length; i++) {
    if (i === ref.index) continue;
    if ((await fingerprintOf(matches[i]!)) === fingerprint) moved.push(i);
  }

  if (moved.length !== 1) {
    throw new StaleElementError(ref.id, ref.selector);
  }
  ref.index = moved[0]!;
  return matches[ref.index]!;
}

/** The text that identifies an element among its matches; undefined if unreadable. */
export async function fingerprintOf(element: {
  getText(): Promise<string>;
}): Promise<string | undefined> {
  try {
    return await element.getText();
  } catch {
    return undefined;
  }
}

/**
 * Converts a strategy + selector into the format webdriverio's $() accepts.
 *
 * Only prefixes webdriverio maps to exactly one protocol strategy are safe.
 * Anything else is sent in its explicit `<strategy>:<value>` form: `ios=` is
 * read as the long-removed `-ios uiautomation`, and a bare string is only
 * treated as a class name when it happens to start with a known class prefix.
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
    case '-ios class chain':
    case 'xpath':
    case 'class name':
    case 'css selector':
      // webdriverio's parser for this form stops at the first line break, which
      // would silently truncate the selector rather than fail.
      if (/[\r\n]/.test(selector)) {
        throw new ValidationError(
          `A "${strategy}" selector cannot contain line breaks. Put it on a single line.`,
        );
      }
      return `${strategy}:${selector}`;
  }
}
