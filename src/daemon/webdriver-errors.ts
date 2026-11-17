import { AppiumAgentError } from '../shared/errors.js';

interface Mapping {
  code: string;
  status: number;
  hint: string;
}

/**
 * webdriver copies the W3C error name (`no such element`, …) onto `error.name`.
 * Mapping the common ones gives callers a stable code and status instead of a
 * 500 carrying a raw protocol message.
 */
const MAPPINGS = new Map<string, Mapping>([
  [
    'no such element',
    {
      code: 'ELEMENT_NOT_FOUND',
      status: 404,
      hint: 'The element is not in the current view hierarchy.',
    },
  ],
  [
    'stale element reference',
    {
      code: 'STALE_ELEMENT',
      status: 410,
      hint: 'The element left the view hierarchy. Find it again.',
    },
  ],
  [
    'invalid selector',
    {
      code: 'INVALID_SELECTOR',
      status: 400,
      hint: 'The driver rejected the selector. Check its syntax against the strategy.',
    },
  ],
  [
    'element not interactable',
    {
      code: 'ELEMENT_NOT_INTERACTABLE',
      status: 409,
      hint: 'The element exists but cannot be interacted with (hidden, disabled, or covered).',
    },
  ],
  [
    'invalid session id',
    {
      code: 'SESSION_NOT_ACTIVE',
      status: 409,
      hint: 'The Appium session no longer exists. Run connect to start a new one.',
    },
  ],
]);

/**
 * Every other W3C error name, plus the generic name webdriver uses when Appium
 * returns one it does not recognise (a missing ffmpeg, an unsupported command).
 */
const OTHER_DRIVER_ERRORS = new Set([
  'WebDriverError',
  'unknown error',
  'unknown command',
  'unknown method',
  'unsupported operation',
  'invalid argument',
  'invalid element state',
  'element click intercepted',
  'move target out of bounds',
  'javascript error',
  'script timeout',
  'timeout',
  'no such alert',
  'unexpected alert open',
  'no such window',
  'no such frame',
  'unable to capture screen',
  'session not created',
]);

/**
 * webdriverio re-finds an element by its original selector when it goes stale
 * mid-command, and throws a plain Error with this wording when that fails.
 */
const REFIND_FAILED = /^Can't call \S+ on .* wasn't found/;

export function fromWebDriverError(err: unknown): AppiumAgentError | null {
  if (!(err instanceof Error)) return null;
  if (REFIND_FAILED.test(err.message)) {
    // Typically the action itself changed what the selector matches on: a
    // `value == "…"` selector stops matching once `type --clear` empties it.
    return new AppiumAgentError(
      'STALE_ELEMENT',
      'The element re-rendered during the action and its selector no longer ' +
        'matches. Use a selector that does not depend on what the action changes ' +
        `(e.g. not the field's value). Driver said: ${err.message}`,
      410,
    );
  }
  const mapping = MAPPINGS.get(err.name);
  if (mapping !== undefined) {
    return new AppiumAgentError(
      mapping.code,
      `${mapping.hint} Driver said: ${err.message}`,
      mapping.status,
    );
  }
  // The device or driver refused the request. That is not a daemon bug, and the
  // driver's own message (often with a fix, like "install ffmpeg") is the useful
  // part, so pass it through instead of a generic 500.
  if (OTHER_DRIVER_ERRORS.has(err.name)) {
    return new AppiumAgentError('DRIVER_ERROR', err.message, 502);
  }
  return null;
}

/** The Appium server has already dropped the session (e.g. its newCommandTimeout fired). */
export function isSessionGoneError(err: unknown): boolean {
  return err instanceof Error && err.name === 'invalid session id';
}
