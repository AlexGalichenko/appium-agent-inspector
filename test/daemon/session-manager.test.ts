import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionAlreadyActiveError, SessionNotActiveError } from '../../src/shared/errors.js';
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
      await expect(manager.startSession(validRequest)).rejects.toThrow(SessionAlreadyActiveError);
    });

    it('passes server options to webdriverio remote()', async () => {
      const { remote } = await import('webdriverio');
      await manager.startSession({ ...validRequest, server: { hostname: '192.168.1.1', port: 4724 } });
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
