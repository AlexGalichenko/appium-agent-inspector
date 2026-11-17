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
  });

  it.each(['WebDriverError', 'unknown error', 'unsupported operation'])(
    'passes a driver-side "%s" through as a 502 DRIVER_ERROR with its message',
    (name) => {
      const mapped = fromWebDriverError(
        webDriverError(name, "'ffmpeg' binary is not found in PATH"),
      );
      expect(mapped?.code).toBe('DRIVER_ERROR');
      expect(mapped?.httpStatus).toBe(502);
      expect(mapped?.message).toBe("'ffmpeg' binary is not found in PATH");
    },
  );

  it('turns a failed re-find mid-action into STALE_ELEMENT with a selector hint', () => {
    const mapped = fromWebDriverError(
      new Error(
        'Can\'t call setValue on element with selector "-ios predicate string:value == ' +
          '"Coffee"" at index 0 because element wasn\'t found',
      ),
    );
    expect(mapped?.code).toBe('STALE_ELEMENT');
    expect(mapped?.httpStatus).toBe(410);
    expect(mapped?.message).toMatch(/does not depend on what the action changes/);
  });

  it('still leaves non-driver errors unmapped', () => {
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
