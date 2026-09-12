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

export function fromWebDriverError(err: unknown): AppiumAgentError | null {
  if (!(err instanceof Error)) return null;
  const mapping = MAPPINGS.get(err.name);
  if (mapping === undefined) return null;
  return new AppiumAgentError(
    mapping.code,
    `${mapping.hint} Driver said: ${err.message}`,
    mapping.status,
  );
}

/** The Appium server has already dropped the session (e.g. its newCommandTimeout fired). */
export function isSessionGoneError(err: unknown): boolean {
  return err instanceof Error && err.name === 'invalid session id';
}
