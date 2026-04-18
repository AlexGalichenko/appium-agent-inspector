import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ElementNotFoundError,
  ElementRefNotFoundError,
  SessionAlreadyActiveError,
  SessionNotActiveError,
  StaleElementError,
} from '../../src/shared/errors.js';
import { buildServer } from '../../src/daemon/server.js';
import type { SessionManager } from '../../src/daemon/session-manager.js';
import type { ElementRegistry } from '../../src/daemon/element-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_META = {
  sessionId: 'sess-1',
  capabilities: { platformName: 'iOS' },
  startedAt: '2026-01-01T00:00:00.000Z',
};

const ELEMENT_REF = {
  id: 'ref-1',
  selector: '~Login',
  strategy: 'accessibility id' as const,
  foundAt: '2026-01-01T00:00:00.000Z',
  sessionId: 'sess-1',
};

const MOCK_ELEMENT = {
  click: vi.fn().mockResolvedValue(undefined),
  setValue: vi.fn().mockResolvedValue(undefined),
  clearValue: vi.fn().mockResolvedValue(undefined),
  getLocation: vi.fn().mockResolvedValue({ x: 10, y: 20 }),
  getSize: vi.fn().mockResolvedValue({ width: 100, height: 50 }),
};

const MOCK_ACTION_CHAIN = {
  move: vi.fn().mockReturnThis(),
  down: vi.fn().mockReturnThis(),
  up: vi.fn().mockReturnThis(),
  pause: vi.fn().mockReturnThis(),
  perform: vi.fn().mockResolvedValue(undefined),
};

function makeSessionManager(overrides: Partial<Record<keyof SessionManager, unknown>> = {}) {
  return {
    startSession: vi.fn().mockResolvedValue(SESSION_META),
    endSession: vi.fn().mockResolvedValue(undefined),
    getDriver: vi.fn().mockReturnValue({
      getPageSource: vi.fn().mockResolvedValue('<xml/>'),
      takeScreenshot: vi.fn().mockResolvedValue('base64png=='),
      activateApp: vi.fn().mockResolvedValue(undefined),
      terminateApp: vi.fn().mockResolvedValue(true),
      execute: vi.fn().mockResolvedValue(null),
      startRecordingScreen: vi.fn().mockResolvedValue(undefined),
      stopRecordingScreen: vi.fn().mockResolvedValue('base64mp4=='),
      performActions: vi.fn().mockResolvedValue(undefined),
      action: vi.fn().mockReturnValue(MOCK_ACTION_CHAIN),
    }),
    getSessionMeta: vi.fn().mockReturnValue(SESSION_META),
    isActive: vi.fn().mockReturnValue(false),
    getSessionId: vi.fn().mockReturnValue('sess-1'),
    ...overrides,
  } as unknown as SessionManager;
}

function makeElementRegistry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    store: vi.fn().mockReturnValue(ELEMENT_REF),
    retrieve: vi.fn().mockReturnValue(ELEMENT_REF),
    findElement: vi.fn().mockResolvedValue(MOCK_ELEMENT),
    retrieveElement: vi.fn().mockResolvedValue(MOCK_ELEMENT),
    invalidateAll: vi.fn(),
    list: vi.fn().mockReturnValue([ELEMENT_REF]),
    ...overrides,
  } as unknown as ElementRegistry;
}

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
} as never;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildServer', () => {
  let server: FastifyInstance;
  let sessionManager: ReturnType<typeof makeSessionManager>;
  let elementRegistry: ReturnType<typeof makeElementRegistry>;

  beforeEach(async () => {
    vi.clearAllMocks();
    sessionManager = makeSessionManager();
    elementRegistry = makeElementRegistry();
    server = await buildServer({ sessionManager, elementRegistry, logger: mockLogger });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── Health ────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 ok', async () => {
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, data: { status: 'ok' } });
    });
  });

  // ── Shutdown ──────────────────────────────────────────────────────────────

  describe('POST /daemon/shutdown', () => {
    it('returns 200 and calls process.exit', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      const res = await server.inject({ method: 'POST', url: '/daemon/shutdown' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
      exitSpy.mockRestore();
    });

    it('calls endSession if session is active before exiting', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
      sessionManager = makeSessionManager({ isActive: vi.fn().mockReturnValue(true) });
      server = await buildServer({ sessionManager, elementRegistry, logger: mockLogger });
      await server.ready();
      await server.inject({ method: 'POST', url: '/daemon/shutdown' });
      expect(sessionManager.endSession).toHaveBeenCalled();
      exitSpy.mockRestore();
    });
  });

  // ── Session routes ────────────────────────────────────────────────────────

  describe('POST /session', () => {
    const validBody = {
      capabilities: {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': 'iPhone 15',
      },
    };

    it('returns 201 with session metadata on success', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/session',
        payload: validBody,
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.data.sessionId).toBe('sess-1');
    });

    it('returns 400 for invalid body', async () => {
      const res = await server.inject({ method: 'POST', url: '/session', payload: {} });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 when session already active', async () => {
      vi.mocked(sessionManager.startSession).mockRejectedValueOnce(
        new SessionAlreadyActiveError(),
      );
      const res = await server.inject({ method: 'POST', url: '/session', payload: validBody });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe('SESSION_ALREADY_ACTIVE');
    });
  });

  describe('DELETE /session', () => {
    it('returns 200 and invalidates element registry', async () => {
      const res = await server.inject({ method: 'DELETE', url: '/session' });
      expect(res.statusCode).toBe(200);
      expect(elementRegistry.invalidateAll).toHaveBeenCalled();
    });

    it('returns 409 when no session is active', async () => {
      vi.mocked(sessionManager.endSession).mockRejectedValueOnce(new SessionNotActiveError());
      const res = await server.inject({ method: 'DELETE', url: '/session' });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /session', () => {
    it('returns active: false when no session', async () => {
      vi.mocked(sessionManager.getSessionMeta).mockReturnValueOnce(null);
      const res = await server.inject({ method: 'GET', url: '/session' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.active).toBe(false);
    });

    it('returns session metadata when active', async () => {
      const res = await server.inject({ method: 'GET', url: '/session' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.active).toBe(true);
      expect(body.data.sessionId).toBe('sess-1');
    });
  });

  // ── Element routes ────────────────────────────────────────────────────────

  describe('POST /elements/find', () => {
    const validBody = { strategy: 'accessibility id', selector: '~Login' };

    it('returns 201 with element reference', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/elements/find',
        payload: validBody,
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.elementId).toBe('ref-1');
    });

    it('returns 400 for invalid body', async () => {
      const res = await server.inject({ method: 'POST', url: '/elements/find', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when element not found', async () => {
      vi.mocked(elementRegistry.findElement).mockRejectedValueOnce(
        new ElementNotFoundError('accessibility id', '~Missing'),
      );
      const res = await server.inject({ method: 'POST', url: '/elements/find', payload: validBody });
      expect(res.statusCode).toBe(404);
    });

    it('returns 409 when no session is active', async () => {
      vi.mocked(sessionManager.getSessionId).mockReturnValueOnce(null);
      vi.mocked(elementRegistry.findElement).mockRejectedValueOnce(new SessionNotActiveError());
      const res = await server.inject({ method: 'POST', url: '/elements/find', payload: validBody });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /elements', () => {
    it('returns list of element references', async () => {
      const res = await server.inject({ method: 'GET', url: '/elements' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.elements).toHaveLength(1);
    });
  });

  describe('GET /elements/:id', () => {
    it('returns element reference by id', async () => {
      const res = await server.inject({ method: 'GET', url: '/elements/ref-1' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe('ref-1');
    });

    it('returns 404 for unknown id', async () => {
      vi.mocked(elementRegistry.retrieve).mockImplementationOnce(() => {
        throw new ElementRefNotFoundError('ghost');
      });
      const res = await server.inject({ method: 'GET', url: '/elements/ghost' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Action routes ─────────────────────────────────────────────────────────

  describe('POST /actions/click', () => {
    it('clicks by element reference id', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/click',
        payload: { elementId: 'ref-1' },
      });
      expect(res.statusCode).toBe(200);
      expect(elementRegistry.retrieveElement).toHaveBeenCalledWith('ref-1', sessionManager);
    });

    it('clicks by strategy and selector', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/click',
        payload: { strategy: 'accessibility id', selector: '~Login' },
      });
      expect(res.statusCode).toBe(200);
      expect(elementRegistry.findElement).toHaveBeenCalled();
    });

    it('returns 404 for stale element', async () => {
      vi.mocked(elementRegistry.retrieveElement).mockRejectedValueOnce(
        new StaleElementError('ref-1', '~Login'),
      );
      const res = await server.inject({
        method: 'POST',
        url: '/actions/click',
        payload: { elementId: 'ref-1' },
      });
      expect(res.statusCode).toBe(410);
    });

    it('returns 400 for invalid body', async () => {
      const res = await server.inject({ method: 'POST', url: '/actions/click', payload: {} });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /actions/type', () => {
    it('types text into element', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/type',
        payload: { elementId: 'ref-1', text: 'hello' },
      });
      expect(res.statusCode).toBe(200);
      expect(MOCK_ELEMENT.setValue).toHaveBeenCalledWith('hello');
    });

    it('clears field first when clearFirst is true', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/type',
        payload: { elementId: 'ref-1', text: 'hello', clearFirst: true },
      });
      expect(res.statusCode).toBe(200);
      expect(MOCK_ELEMENT.clearValue).toHaveBeenCalled();
    });

    it('does not clear field when clearFirst is false', async () => {
      vi.mocked(MOCK_ELEMENT.clearValue).mockClear();
      const res = await server.inject({
        method: 'POST',
        url: '/actions/type',
        payload: { elementId: 'ref-1', text: 'hello', clearFirst: false },
      });
      expect(res.statusCode).toBe(200);
      expect(MOCK_ELEMENT.clearValue).not.toHaveBeenCalled();
    });
  });

  describe('GET /actions/page-source', () => {
    it('returns the page source', async () => {
      const res = await server.inject({ method: 'GET', url: '/actions/page-source' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.source).toBe('<xml/>');
      expect(body.data.capturedAt).toBeTruthy();
    });

    it('returns 409 when no session', async () => {
      vi.mocked(sessionManager.getDriver).mockImplementationOnce(() => {
        throw new SessionNotActiveError();
      });
      const res = await server.inject({ method: 'GET', url: '/actions/page-source' });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /actions/screenshot', () => {
    it('returns base64 screenshot data and capturedAt', async () => {
      const res = await server.inject({ method: 'GET', url: '/actions/screenshot' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.data).toBe('base64png==');
      expect(body.data.capturedAt).toBeTruthy();
    });

    it('returns 409 when no session is active', async () => {
      vi.mocked(sessionManager.getDriver).mockImplementationOnce(() => {
        throw new SessionNotActiveError();
      });
      const res = await server.inject({ method: 'GET', url: '/actions/screenshot' });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe('SESSION_NOT_ACTIVE');
    });
  });

  describe('POST /actions/activate-app', () => {
    it('activates the app and returns 200', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/activate-app',
        payload: { appId: 'com.example.app' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, data: { message: 'App activated' } });
      const driver = sessionManager.getDriver();
      expect(driver.activateApp).toHaveBeenCalledWith('com.example.app');
    });

    it('returns 400 for missing appId', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/activate-app',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for empty appId', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/activate-app',
        payload: { appId: '' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 when no session is active', async () => {
      vi.mocked(sessionManager.getDriver).mockImplementationOnce(() => {
        throw new SessionNotActiveError();
      });
      const res = await server.inject({
        method: 'POST',
        url: '/actions/activate-app',
        payload: { appId: 'com.example.app' },
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe('SESSION_NOT_ACTIVE');
    });
  });

  describe('POST /actions/terminate-app', () => {
    it('terminates the app and returns terminated: true when app was running', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/terminate-app',
        payload: { appId: 'com.example.app' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, data: { terminated: true } });
      const driver = sessionManager.getDriver();
      expect(driver.terminateApp).toHaveBeenCalledWith('com.example.app');
    });

    it('returns terminated: false when app was not running', async () => {
      const driver = sessionManager.getDriver();
      vi.mocked(driver.terminateApp).mockResolvedValueOnce(false);
      const res = await server.inject({
        method: 'POST',
        url: '/actions/terminate-app',
        payload: { appId: 'com.example.app' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.terminated).toBe(false);
    });

    it('returns 400 for missing appId', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/terminate-app',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 when no session is active', async () => {
      vi.mocked(sessionManager.getDriver).mockImplementationOnce(() => {
        throw new SessionNotActiveError();
      });
      const res = await server.inject({
        method: 'POST',
        url: '/actions/terminate-app',
        payload: { appId: 'com.example.app' },
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe('SESSION_NOT_ACTIVE');
    });
  });

  // ── perform-action route ──────────────────────────────────────────────────

  describe('POST /actions/perform', () => {
    it('performs a tap gesture via the fluent action chain', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'tap', x: 200, y: 400 },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, data: { message: 'tap performed' } });
      const driver = sessionManager.getDriver();
      expect(driver.action).toHaveBeenCalledWith('pointer', { parameters: { pointerType: 'touch' } });
      expect(MOCK_ACTION_CHAIN.perform).toHaveBeenCalled();
    });

    it('performs a swipe gesture via the fluent action chain', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'swipe', startX: 100, startY: 700, endX: 100, endY: 200, duration: 400 },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, data: { message: 'swipe performed' } });
      expect(MOCK_ACTION_CHAIN.perform).toHaveBeenCalled();
    });

    it('performs a long-press gesture via the fluent action chain', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'long-press', x: 200, y: 400, duration: 1500 },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, data: { message: 'long-press performed' } });
      expect(MOCK_ACTION_CHAIN.perform).toHaveBeenCalled();
    });

    it('performs raw W3C actions via performActions', async () => {
      const actions = [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: 200, y: 400 },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 50 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ];
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: actions,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true, data: { message: 'actions performed' } });
      const driver = sessionManager.getDriver();
      expect(driver.performActions).toHaveBeenCalledWith(actions);
    });

    it('applies default duration for tap when omitted', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'tap', x: 100, y: 200 },
      });
      expect(res.statusCode).toBe(200);
      expect(MOCK_ACTION_CHAIN.pause).toHaveBeenCalledWith(0);
    });

    it('applies default duration for swipe when omitted', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'swipe', startX: 0, startY: 0, endX: 0, endY: 100 },
      });
      expect(res.statusCode).toBe(200);
      expect(MOCK_ACTION_CHAIN.move).toHaveBeenCalledWith(
        expect.objectContaining({ duration: 1000 }),
      );
    });

    it('applies default duration for long-press when omitted', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'long-press', x: 100, y: 200 },
      });
      expect(res.statusCode).toBe(200);
      expect(MOCK_ACTION_CHAIN.pause).toHaveBeenCalledWith(1500);
    });

    it('returns 400 for unknown gesture type', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'double-tap', x: 100, y: 200 },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing coordinates in tap', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'tap' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 when no session is active', async () => {
      vi.mocked(sessionManager.getDriver).mockImplementationOnce(() => {
        throw new SessionNotActiveError();
      });
      const res = await server.inject({
        method: 'POST',
        url: '/actions/perform',
        payload: { type: 'tap', x: 100, y: 200 },
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe('SESSION_NOT_ACTIVE');
    });
  });

  // ── Error handler ─────────────────────────────────────────────────────────

  describe('global error handler', () => {
    it('returns 500 with INTERNAL_ERROR for unhandled errors', async () => {
      vi.mocked(sessionManager.startSession).mockRejectedValueOnce(
        new Error('unexpected boom'),
      );
      const res = await server.inject({
        method: 'POST',
        url: '/session',
        payload: {
          capabilities: {
            platformName: 'iOS',
            'appium:automationName': 'XCUITest',
            'appium:deviceName': 'iPhone 15',
          },
        },
      });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('unexpected boom');
    });
  });
});
