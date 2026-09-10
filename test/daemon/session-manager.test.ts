import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextNotFoundError,
  SessionAlreadyActiveError,
  SessionNotActiveError,
} from '../../src/shared/errors.js';
import { SessionManager } from '../../src/daemon/session-manager.js';

// ---------------------------------------------------------------------------
// Mock webdriverio
// ---------------------------------------------------------------------------

vi.mock('webdriverio', () => ({ remote: vi.fn() }));

function makeMockDriver(sessionId = 'test-session') {
  return {
    sessionId,
    capabilities: { platformName: 'iOS' as const },
    setTimeout: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
  };
}

const validRequest = {
  capabilities: {
    platformName: 'iOS' as const,
    'appium:automationName': 'XCUITest' as const,
    'appium:deviceName': 'iPhone 15',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionManager', () => {
  let manager: SessionManager;
  let mockLogger: ReturnType<typeof makeMockLogger>;

  function makeMockLogger() {
    return {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const { remote } = await import('webdriverio');
    const driver = makeMockDriver();
    vi.mocked(remote).mockResolvedValue(driver as never);
    mockLogger = makeMockLogger();
    manager = new SessionManager(mockLogger as never);
  });

  // ── initial state ────────────────────────────────────────────────────────

  it('starts inactive', () => {
    expect(manager.isActive()).toBe(false);
    expect(manager.getSessionId()).toBeNull();
    expect(manager.getSessionMeta()).toBeNull();
  });

  it('getDriver throws when inactive', () => {
    expect(() => manager.getDriver()).toThrow(SessionNotActiveError);
  });

  // ── startSession ─────────────────────────────────────────────────────────

  describe('startSession', () => {
    it('creates a session and returns metadata', async () => {
      const meta = await manager.startSession(validRequest);
      expect(meta.sessionId).toBe('test-session');
      expect(meta.startedAt).toBeTruthy();
      expect(meta.capabilities).toEqual({ platformName: 'iOS' });
    });

    it('transitions to active state', async () => {
      await manager.startSession(validRequest);
      expect(manager.isActive()).toBe(true);
      expect(manager.getSessionId()).toBe('test-session');
    });

    it('calls setTimeout with implicit timeout', async () => {
      const { remote } = await import('webdriverio');
      const driver = makeMockDriver();
      vi.mocked(remote).mockResolvedValue(driver as never);
      await manager.startSession(validRequest);
      expect(driver.setTimeout).toHaveBeenCalledWith({ implicit: expect.any(Number) });
    });

    it('throws SessionAlreadyActiveError if called twice', async () => {
      await manager.startSession(validRequest);
      await expect(manager.startSession(validRequest)).rejects.toThrow(
        SessionAlreadyActiveError,
      );
    });

    it('passes server options to webdriverio remote()', async () => {
      const { remote } = await import('webdriverio');
      await manager.startSession({
        ...validRequest,
        server: { hostname: '192.168.1.1', port: 4724 },
      });
      expect(remote).toHaveBeenCalledWith(
        expect.objectContaining({ hostname: '192.168.1.1', port: 4724 }),
      );
    });
  });

  // ── endSession ────────────────────────────────────────────────────────────

  describe('endSession', () => {
    it('throws SessionNotActiveError when no session', async () => {
      await expect(manager.endSession()).rejects.toThrow(SessionNotActiveError);
    });

    it('calls deleteSession and transitions to inactive', async () => {
      const { remote } = await import('webdriverio');
      const driver = makeMockDriver();
      vi.mocked(remote).mockResolvedValue(driver as never);
      await manager.startSession(validRequest);
      await manager.endSession();
      expect(driver.deleteSession).toHaveBeenCalled();
      expect(manager.isActive()).toBe(false);
      expect(manager.getSessionId()).toBeNull();
      expect(manager.getSessionMeta()).toBeNull();
    });

    it('still cleans up if deleteSession throws', async () => {
      const { remote } = await import('webdriverio');
      const driver = makeMockDriver();
      driver.deleteSession.mockRejectedValueOnce(new Error('Already dead') as never);
      vi.mocked(remote).mockResolvedValue(driver as never);
      await manager.startSession(validRequest);
      await manager.endSession();
      expect(manager.isActive()).toBe(false);
    });
  });

  // ── getDriver ─────────────────────────────────────────────────────────────

  describe('getDriver', () => {
    it('returns the driver after session is started', async () => {
      await manager.startSession(validRequest);
      expect(() => manager.getDriver()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Heartbeat — an unresponsive session must be discarded, not merely logged,
// so the next command fails with SESSION_NOT_ACTIVE instead of a raw
// WebDriver error.
// ---------------------------------------------------------------------------

describe('SessionManager heartbeat', () => {
  const HEARTBEAT_MS = 30_000;

  function makeLogger() {
    return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
  }

  async function startWith(getTimeouts: ReturnType<typeof vi.fn>) {
    const { remote } = await import('webdriverio');
    const driver = { ...makeMockDriver(), getTimeouts };
    vi.mocked(remote).mockResolvedValue(driver as never);

    const manager = new SessionManager(makeLogger());
    await manager.startSession(validRequest);
    return { manager, driver };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the session alive while heartbeats succeed', async () => {
    const getTimeouts = vi.fn().mockResolvedValue({ implicit: 5000 });
    const { manager } = await startWith(getTimeouts);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    }

    expect(getTimeouts).toHaveBeenCalledTimes(5);
    expect(manager.isActive()).toBe(true);
  });

  it('tolerates failures below the limit', async () => {
    const getTimeouts = vi
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue({ implicit: 5000 });
    const { manager } = await startWith(getTimeouts);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    expect(manager.isActive()).toBe(true);
  });

  it('discards the session after three consecutive failures', async () => {
    const getTimeouts = vi.fn().mockRejectedValue(new Error('session gone'));
    const { manager } = await startWith(getTimeouts);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);

    expect(manager.isActive()).toBe(false);
    expect(() => manager.getDriver()).toThrow(SessionNotActiveError);
  });

  it('resets the failure count after a recovery', async () => {
    const getTimeouts = vi
      .fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce({ implicit: 5000 })
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'));
    const { manager } = await startWith(getTimeouts);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 5);
    expect(manager.isActive()).toBe(true);
  });

  it('stops beating once the session is discarded', async () => {
    const getTimeouts = vi.fn().mockRejectedValue(new Error('gone'));
    await startWith(getTimeouts);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    const callsAtDeath = getTimeouts.mock.calls.length;

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 5);
    expect(getTimeouts).toHaveBeenCalledTimes(callsAtDeath);
  });

  it('notifies the session-lost handler so element refs are flushed', async () => {
    const getTimeouts = vi.fn().mockRejectedValue(new Error('gone'));
    const { remote } = await import('webdriverio');
    vi.mocked(remote).mockResolvedValue({ ...makeMockDriver(), getTimeouts } as never);

    const manager = new SessionManager(makeLogger());
    const onLost = vi.fn();
    manager.setSessionLostHandler(onLost);
    await manager.startSession(validRequest);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(onLost).toHaveBeenCalled();
  });

  it('allows a fresh session after the dead one is discarded', async () => {
    const getTimeouts = vi.fn().mockRejectedValue(new Error('gone'));
    const { manager } = await startWith(getTimeouts);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);

    const { remote } = await import('webdriverio');
    vi.mocked(remote).mockResolvedValue({
      ...makeMockDriver('new-session'),
      getTimeouts: vi.fn().mockResolvedValue({}),
    } as never);

    await expect(manager.startSession(validRequest)).resolves.toMatchObject({
      sessionId: 'new-session',
    });
  });
});

// ---------------------------------------------------------------------------
// Contexts and device info
// ---------------------------------------------------------------------------

describe('SessionManager contexts', () => {
  function makeLogger() {
    return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
  }

  async function start(extra: Record<string, unknown>) {
    const { remote } = await import('webdriverio');
    vi.mocked(remote).mockResolvedValue({ ...makeMockDriver(), ...extra } as never);
    const manager = new SessionManager(makeLogger());
    await manager.startSession(validRequest);
    return manager;
  }

  it('lists contexts and marks the current one', async () => {
    const manager = await start({
      getContexts: vi.fn().mockResolvedValue(['NATIVE_APP', 'WEBVIEW_1']),
      getContext: vi.fn().mockResolvedValue('NATIVE_APP'),
    });

    await expect(manager.getContexts()).resolves.toEqual({
      current: 'NATIVE_APP',
      contexts: ['NATIVE_APP', 'WEBVIEW_1'],
    });
  });

  it('normalises drivers that return context objects instead of strings', async () => {
    const manager = await start({
      getContexts: vi.fn().mockResolvedValue([{ id: 'NATIVE_APP' }, { id: 'WEBVIEW_1' }]),
      getContext: vi.fn().mockResolvedValue({ id: 'WEBVIEW_1' }),
    });

    await expect(manager.getContexts()).resolves.toEqual({
      current: 'WEBVIEW_1',
      contexts: ['NATIVE_APP', 'WEBVIEW_1'],
    });
  });

  it('switches to an available context', async () => {
    const switchContext = vi.fn().mockResolvedValue(undefined);
    const manager = await start({
      getContexts: vi.fn().mockResolvedValue(['NATIVE_APP', 'WEBVIEW_1']),
      getContext: vi.fn().mockResolvedValue('NATIVE_APP'),
      switchContext,
    });

    await expect(manager.switchContext('WEBVIEW_1')).resolves.toMatchObject({
      current: 'WEBVIEW_1',
    });
    expect(switchContext).toHaveBeenCalledWith('WEBVIEW_1');
  });

  it('refuses to switch to a context the driver does not offer', async () => {
    const switchContext = vi.fn();
    const manager = await start({
      getContexts: vi.fn().mockResolvedValue(['NATIVE_APP']),
      getContext: vi.fn().mockResolvedValue('NATIVE_APP'),
      switchContext,
    });

    await expect(manager.switchContext('WEBVIEW_9')).rejects.toThrow(
      ContextNotFoundError,
    );
    expect(switchContext).not.toHaveBeenCalled();
  });

  it('requires an active session to read contexts', async () => {
    const manager = new SessionManager(makeLogger());
    await expect(manager.getContexts()).rejects.toThrow(SessionNotActiveError);
  });
});

describe('SessionManager device info', () => {
  function makeLogger() {
    return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
  }

  it('combines window size, orientation and session capabilities', async () => {
    const { remote } = await import('webdriverio');
    vi.mocked(remote).mockResolvedValue({
      ...makeMockDriver(),
      capabilities: {
        platformName: 'iOS',
        'appium:platformVersion': '18.0',
        'appium:deviceName': 'iPhone 15',
      },
      getWindowSize: vi.fn().mockResolvedValue({ width: 393, height: 852 }),
      getOrientation: vi.fn().mockResolvedValue('PORTRAIT'),
      getContext: vi.fn().mockResolvedValue('NATIVE_APP'),
    } as never);

    const manager = new SessionManager(makeLogger());
    await manager.startSession(validRequest);

    await expect(manager.getDeviceInfo()).resolves.toEqual({
      platformName: 'iOS',
      platformVersion: '18.0',
      deviceName: 'iPhone 15',
      window: { width: 393, height: 852 },
      orientation: 'PORTRAIT',
      context: 'NATIVE_APP',
    });
  });

  it('still reports screen size when orientation is unsupported', async () => {
    const { remote } = await import('webdriverio');
    vi.mocked(remote).mockResolvedValue({
      ...makeMockDriver(),
      capabilities: { platformName: 'Android' },
      getWindowSize: vi.fn().mockResolvedValue({ width: 411, height: 891 }),
      getOrientation: vi.fn().mockRejectedValue(new Error('not supported')),
      getContext: vi.fn().mockResolvedValue('NATIVE_APP'),
    } as never);

    const manager = new SessionManager(makeLogger());
    await manager.startSession(validRequest);

    const info = await manager.getDeviceInfo();
    expect(info.orientation).toBeNull();
    expect(info.window).toEqual({ width: 411, height: 891 });
  });
});
