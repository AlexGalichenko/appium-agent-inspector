import { describe, expect, it } from 'vitest';
import {
  AppiumAgentError,
  DaemonNotRunningError,
  ElementNotFoundError,
  ElementRefNotFoundError,
  SessionAlreadyActiveError,
  SessionNotActiveError,
  StaleElementError,
  ValidationError,
  ContextNotFoundError,
  UnauthorizedError,
  WaitTimeoutError,
} from '../../src/shared/errors.js';

describe('AppiumAgentError', () => {
  it('sets code, message, and name', () => {
    const err = new AppiumAgentError('MY_CODE', 'my message');
    expect(err.code).toBe('MY_CODE');
    expect(err.message).toBe('my message');
    expect(err.name).toBe('AppiumAgentError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('SessionNotActiveError', () => {
  it('has correct code and message', () => {
    const err = new SessionNotActiveError();
    expect(err.code).toBe('SESSION_NOT_ACTIVE');
    expect(err.message).toMatch(/connect/);
    expect(err).toBeInstanceOf(AppiumAgentError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('SessionAlreadyActiveError', () => {
  it('has correct code and message', () => {
    const err = new SessionAlreadyActiveError();
    expect(err.code).toBe('SESSION_ALREADY_ACTIVE');
    expect(err.message).toMatch(/delete-session/);
    expect(err).toBeInstanceOf(AppiumAgentError);
  });
});

describe('ElementNotFoundError', () => {
  it('interpolates strategy and selector into message', () => {
    const err = new ElementNotFoundError('accessibility id', 'Login Button');
    expect(err.code).toBe('ELEMENT_NOT_FOUND');
    expect(err.message).toContain('accessibility id');
    expect(err.message).toContain('Login Button');
    expect(err).toBeInstanceOf(AppiumAgentError);
  });
});

describe('ElementRefNotFoundError', () => {
  it('interpolates id into message', () => {
    const err = new ElementRefNotFoundError('abc123');
    expect(err.code).toBe('ELEMENT_REF_NOT_FOUND');
    expect(err.message).toContain('abc123');
    expect(err).toBeInstanceOf(AppiumAgentError);
  });
});

describe('StaleElementError', () => {
  it('interpolates id and selector into message', () => {
    const err = new StaleElementError('ref-id', '~Login');
    expect(err.code).toBe('STALE_ELEMENT');
    expect(err.message).toContain('ref-id');
    expect(err.message).toContain('~Login');
    expect(err).toBeInstanceOf(AppiumAgentError);
  });
});

describe('DaemonNotRunningError', () => {
  it('has correct code and message', () => {
    const err = new DaemonNotRunningError();
    expect(err.code).toBe('DAEMON_NOT_RUNNING');
    expect(err.message).toMatch(/daemon:start/i);
    expect(err).toBeInstanceOf(AppiumAgentError);
  });
});

describe('ValidationError', () => {
  it('works without details', () => {
    const err = new ValidationError('bad input');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('bad input');
    expect(err.details).toBeUndefined();
    expect(err).toBeInstanceOf(AppiumAgentError);
  });

  it('stores details when provided', () => {
    const details = { field: ['required'] };
    const err = new ValidationError('bad input', details);
    expect(err.details).toEqual(details);
  });
});

// ---------------------------------------------------------------------------
// HTTP status mapping — the daemon's single error handler relies on these, so
// a wrong status here silently becomes a wrong response code everywhere.
// ---------------------------------------------------------------------------

describe('httpStatus', () => {
  it('defaults to 500 for a bare AppiumAgentError', () => {
    expect(new AppiumAgentError('X', 'y').httpStatus).toBe(500);
  });

  it.each([
    [new SessionNotActiveError(), 409],
    [new SessionAlreadyActiveError(), 409],
    [new ElementNotFoundError('id', 'x'), 404],
    [new ElementRefNotFoundError('r1'), 404],
    [new StaleElementError('r1', 'x'), 410],
    [new ValidationError('bad'), 400],
    [new WaitTimeoutError('displayed', 'x', 100), 408],
    [new ContextNotFoundError('WEBVIEW_9', ['NATIVE_APP']), 404],
    [new UnauthorizedError(), 401],
    [new DaemonNotRunningError(), 503],
  ])('maps %s to its status', (err, status) => {
    expect(err.httpStatus).toBe(status);
  });
});

describe('ValidationError details', () => {
  it('carries structured details for the caller', () => {
    const err = new ValidationError('Invalid request body', 'selector: required');
    expect(err.details).toBe('selector: required');
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('leaves details undefined when none are given', () => {
    expect(new ValidationError('nope').details).toBeUndefined();
  });
});

describe('WaitTimeoutError', () => {
  it('states the condition, selector and budget', () => {
    const err = new WaitTimeoutError('displayed', '~Login', 5000);
    expect(err.message).toContain('displayed');
    expect(err.message).toContain('~Login');
    expect(err.message).toContain('5000');
  });
});

describe('ContextNotFoundError', () => {
  it('lists the contexts that were available', () => {
    const err = new ContextNotFoundError('WEBVIEW_9', ['NATIVE_APP', 'WEBVIEW_1']);
    expect(err.message).toContain('NATIVE_APP');
    expect(err.message).toContain('WEBVIEW_1');
  });

  it('reads sensibly when there are no contexts at all', () => {
    expect(new ContextNotFoundError('X', []).message).toContain('(none)');
  });
});
