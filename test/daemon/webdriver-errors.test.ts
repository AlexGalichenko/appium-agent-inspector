import { describe, expect, it } from 'vitest';
import { AppiumAgentError } from '../../src/shared/errors.js';
import {
  fromWebDriverError,
  isSessionGoneError,
} from '../../src/daemon/webdriver-errors.js';

function webDriverError(name: string, message = 'details from the driver') {
  return Object.assign(new Error(message), { name });
}

describe('fromWebDriverError', () => {
  it.each([
    ['no such element', 'ELEMENT_NOT_FOUND', 404],
    ['stale element reference', 'STALE_ELEMENT', 410],
    ['invalid selector', 'INVALID_SELECTOR', 400],
    ['element not interactable', 'ELEMENT_NOT_INTERACTABLE', 409],
    ['invalid session id', 'SESSION_NOT_ACTIVE', 409],
  ])('maps "%s" to %s (%i)', (name, code, status) => {
    const mapped = fromWebDriverError(webDriverError(name));
    expect(mapped).toBeInstanceOf(AppiumAgentError);
    expect(mapped?.code).toBe(code);
    expect(mapped?.httpStatus).toBe(status);
  });

  it("keeps the driver's own message for diagnosis", () => {
    expect(
      fromWebDriverError(webDriverError('invalid selector', 'bad xpath'))?.message,
    ).toMatch(/bad xpath/);
  });

  it('leaves unrelated errors alone', () => {
    expect(fromWebDriverError(new Error('boom'))).toBeNull();
    expect(fromWebDriverError(webDriverError('constructor'))).toBeNull();
    expect(fromWebDriverError('not an error')).toBeNull();
  });
});

describe('isSessionGoneError', () => {
  it('recognises only the invalid-session error', () => {
    expect(isSessionGoneError(webDriverError('invalid session id'))).toBe(true);
    expect(isSessionGoneError(webDriverError('no such element'))).toBe(false);
  });
});
