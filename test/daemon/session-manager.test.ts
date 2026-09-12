import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContextNotFoundError,
  SessionAlreadyActiveError,
  SessionNotActiveError,
} from '../../src/shared/errors.js';
import { SessionManager } from '../../src/daemon/session-manager.js';
import { DEFAULT_IMPLICIT_TIMEOUT_MS } from '../../src/shared/constants.js';

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

function makeQuietLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;
}

// ---------------------------------------------------------------------------
// Start guards — a lost race or half-configured session leaks on the Appium
// server and keeps holding the device.
// ---------------------------------------------------------------------------

describe('SessionManager start guards', () => {
  it('refuses a second connect while the first is still starting', async () => {
    const { remote } = await import('webdriverio');
    let finish!: (driver: unknown) => void;
    vi.mocked(remote)
      .mockClear()
      .mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve)) as never,
      );

    const manager = new SessionManager(makeQuietLogger());
    const first = manager.startSession(validRequest);

    await expect(manager.startSession(validRequest)).rejects.toThrow(
      SessionAlreadyActiveError,
    );

    finish(makeMockDriver());
    await expect(first).resolves.toMatchObject({ sessionId: 'test-session' });
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it('deletes the new session when configuring it fails', async () => {
    const { remote } = await import('webdriverio');
    const driver = makeMockDriver();
    driver.setTimeout.mockRejectedValueOnce(new Error('bad timeouts') as never);
    vi.mocked(remote).mockResolvedValue(driver as never);

    const manager = new SessionManager(makeQuietLogger());
    await expect(manager.startSession(validRequest)).rejects.toThrow('bad timeouts');
    expect(driver.deleteSession).toHaveBeenCalled();
    expect(manager.isActive()).toBe(false);

    // The failed attempt must not leave the manager stuck "starting".
    await expect(manager.startSession(validRequest)).resolves.toMatchObject({
      sessionId: 'test-session',
    });
  });
});

// ---------------------------------------------------------------------------
// Heartbeat under load and idle timeout
// ---------------------------------------------------------------------------

describe('SessionManager heartbeat scheduling', () => {
  const HEARTBEAT_MS = 30_000;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function start(getTimeouts: ReturnType<typeof vi.fn>, idleTimeoutMs?: number) {
    const { remote } = await import('webdriverio');
    const driver = { ...makeMockDriver(), getTimeouts };
    vi.mocked(remote).mockResolvedValue(driver as never);
    const manager = new SessionManager(
      makeQuietLogger(),
      idleTimeoutMs === undefined ? {} : { idleTimeoutMs },
    );
    await manager.startSession(validRequest);
    return { manager, driver };
  }

  it('does not stack beats behind one still waiting on a long command', async () => {
    // The Appium server is busy (an install, say) and has not answered yet.
    const getTimeouts = vi.fn().mockReturnValue(new Promise(() => undefined));
    const { manager } = await start(getTimeouts);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 5);

    expect(getTimeouts).toHaveBeenCalledTimes(1);
    expect(manager.isActive()).toBe(true);
  });

  it('ends an idle session so the device is released', async () => {
    const { manager, driver } = await start(vi.fn().mockResolvedValue({}), 60_000);

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    expect(driver.deleteSession).toHaveBeenCalled();
    expect(manager.isActive()).toBe(false);
  });

  it('keeps a session alive while requests keep arriving', async () => {
    const { manager } = await start(vi.fn().mockResolvedValue({}), 60_000);

    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      manager.touch();
    }

    expect(manager.isActive()).toBe(true);
  });

  it('never ends a session for idleness when the timeout is disabled', async () => {
    const { manager } = await start(vi.fn().mockResolvedValue({}));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 200);
    expect(manager.isActive()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Session loss reported by Appium, and implicit-wait overrides
// ---------------------------------------------------------------------------

describe('SessionManager session loss and implicit wait', () => {
  async function start() {
    const { remote } = await import('webdriverio');
    const driver = makeMockDriver();
    vi.mocked(remote).mockResolvedValue(driver as never);
    const manager = new SessionManager(makeQuietLogger());
    await manager.startSession(validRequest);
    driver.setTimeout.mockClear();
    return { manager, driver };
  }

  it('discards a session Appium reports as gone, flushing element refs', async () => {
    const { manager, driver } = await start();
    const onLost = vi.fn();
    manager.setSessionLostHandler(onLost);

    manager.markSessionLost();

    expect(manager.isActive()).toBe(false);
    expect(onLost).toHaveBeenCalled();
    expect(driver.deleteSession).not.toHaveBeenCalled();
  });

  it('ignores a loss report when no session is active', () => {
    const manager = new SessionManager(makeQuietLogger());
    expect(() => manager.markSessionLost()).not.toThrow();
  });

  it('zeroes the implicit wait for the callback and restores it afterwards', async () => {
    const { manager, driver } = await start();

    await manager.withoutImplicitWait(async () => {
      expect(driver.setTimeout).toHaveBeenLastCalledWith({ implicit: 0 });
    });

    expect(driver.setTimeout).toHaveBeenLastCalledWith({
      implicit: DEFAULT_IMPLICIT_TIMEOUT_MS,
    });
  });

  it('restores the implicit wait when the callback throws', async () => {
    const { manager, driver } = await start();

    await expect(
      manager.withoutImplicitWait(async () => {
        throw new Error('poll failed');
      }),
    ).rejects.toThrow('poll failed');

    expect(driver.setTimeout).toHaveBeenLastCalledWith({
      implicit: DEFAULT_IMPLICIT_TIMEOUT_MS,
    });
  });

  it('changes the timeout only once for nested calls', async () => {
    const { manager, driver } = await start();

    await manager.withoutImplicitWait(() =>
      manager.withoutImplicitWait(async () => undefined),
    );

    expect(driver.setTimeout).toHaveBeenCalledTimes(2);
  });
});
