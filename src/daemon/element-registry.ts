import { randomBytes } from 'node:crypto';
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
    index?: number;
    fingerprint?: string;
  }): ElementReference {
    const index = opts.index ?? 0;
    // Finding the same element again hands back the reference already held for
    // it, so the registry tracks what is on screen rather than every lookup.
    const existing = this.findStored(opts.strategy, opts.selector, index);
    if (existing !== undefined) {
      if (opts.fingerprint !== undefined) existing.fingerprint = opts.fingerprint;
      else delete existing.fingerprint;
      return existing;
    }

    const ref: ElementReference = {
      // 96 random bits: unguessable, and short enough not to bloat agent context.
      id: randomBytes(12).toString('base64url'),
      selector: opts.selector,
      strategy: opts.strategy,
      index,
      ...(opts.fingerprint !== undefined && { fingerprint: opts.fingerprint }),
    };
    this.refs.set(ref.id, ref);
    return ref;
  }

  private findStored(
    strategy: LocatorStrategy,
    selector: string,
    index: number,
  ): ElementReference | undefined {
    for (const ref of this.refs.values()) {
      if (ref.strategy === strategy && ref.selector === selector && ref.index === index) {
        return ref;
      }
    }
    return undefined;
  }

  retrieve(id: string): ElementReference {
    const ref = this.refs.get(id);
    if (ref === undefined) {
      throw new ElementRefNotFoundError(id);
    }
    return ref;
  }

  /**
   * The match at `index`. One find-elements call answers both "does it exist"
   * and "which one": a `$()` would need a second `isExisting()` round trip,
   * since wdio re-queries the device for it.
   */
  async findElement(
    strategy: LocatorStrategy,
    selector: string,
    sessionManager: SessionManager,
    index = 0,
  ): Promise<WebdriverIO.Element> {
    const matches = await this.findAll(strategy, selector, sessionManager);
    const element = matches[index];
    if (element === undefined) throw new ElementNotFoundError(strategy, selector);
    return element;
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
      return await findMatches(driver, wdioSelector);
    } catch {
      return [];
    }
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

      const element = (await findMatches(driver, wdioSelector))[ref.index];
      if (element === undefined) throw new StaleElementError(id, ref.selector);
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
 * Every element the selector matches now, as a plain array. Never index a
 * `$$()` result directly: in webdriverio 10 it is a proxy, and reading past its
 * end does not give `undefined` — it polls the device for up to five seconds
 * and then hands back a "not found" element object. A plain copy makes a miss
 * cheap and makes `[i] === undefined` mean what it says.
 */
export async function findMatches(
  driver: Driver,
  wdioSelector: string,
): Promise<WebdriverIO.Element[]> {
  return Array.from(await driver.$$(wdioSelector));
}

/**
 * A positional reference is only trusted while the element at its index still
 * carries the fingerprint it had when found. Otherwise the list has shifted:
 * follow the element to its new position when exactly one match carries the
 * same text, and report it stale rather than act on whatever now sits at the
 * old index. A rect fingerprint cannot be followed — another element can move
 * into the same spot — so a mismatch there is always stale.
 */
async function rehydratePositional(
  ref: ElementReference,
  fingerprint: string,
  driver: Driver,
  wdioSelector: string,
): Promise<WebdriverIO.Element> {
  const matches = await findMatches(driver, wdioSelector);

  const atIndex = matches[ref.index];
  if (atIndex !== undefined && (await fingerprintOf(atIndex)) === fingerprint) {
    return atIndex;
  }

  if (isRectFingerprint(fingerprint)) {
    throw new StaleElementError(ref.id, ref.selector);
  }

  const moved: number[] = [];
  for (let i = 0; i < matches.length; i++) {
    if (i === ref.index) continue;
    if ((await textOf(matches[i]!)) === fingerprint) moved.push(i);
  }

  if (moved.length !== 1) {
    throw new StaleElementError(ref.id, ref.selector);
  }
  ref.index = moved[0]!;
  return matches[ref.index]!;
}

interface Fingerprintable {
  getText(): Promise<string>;
  getLocation(): Promise<{ x: number; y: number }>;
  getSize(): Promise<{ width: number; height: number }>;
}

async function textOf(element: Pick<Fingerprintable, 'getText'>): Promise<string> {
  try {
    return await element.getText();
  } catch {
    return '';
  }
}

/** Rect fingerprints use page-source's `@x,y WxH` notation. */
function isRectFingerprint(fingerprint: string): boolean {
  return fingerprint.startsWith('@');
}

/**
 * What identifies an element among its matches: its text, or — for rows with
 * none, such as icons — its on-screen rect. Text alone would give every
 * textless row the same empty fingerprint, so any of them would pass for the
 * stored one. Undefined when neither can be read.
 */
export async function fingerprintOf(
  element: Fingerprintable,
): Promise<string | undefined> {
  const text = await textOf(element);
  if (text !== '') return text;
  try {
    const [{ x, y }, { width, height }] = await Promise.all([
      element.getLocation(),
      element.getSize(),
    ]);
    return `@${x},${y} ${width}x${height}`;
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
