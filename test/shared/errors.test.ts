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
    expect(err.message).toMatch(/close-app/);
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
    expect(err.message).toMatch(/daemon start/i);
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
