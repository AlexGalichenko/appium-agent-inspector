import { remote } from 'webdriverio';
import {
  ContextNotFoundError,
  SessionAlreadyActiveError,
  SessionNotActiveError,
} from '../shared/errors.js';
import type {
  ContextsResponse,
  DeviceInfoResponse,
  StartSessionRequest,
  StartSessionResponse,
} from '../shared/types.js';
import {
  APPIUM_DEFAULT_HOST,
  APPIUM_DEFAULT_PATH,
  APPIUM_DEFAULT_PORT,
  DEFAULT_IMPLICIT_TIMEOUT_MS,
} from '../shared/constants.js';
import type { Logger } from '../shared/logger.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
/** Consecutive heartbeat failures before the session is considered dead. */
const HEARTBEAT_FAILURE_LIMIT = 3;

export type Driver = Awaited<ReturnType<typeof remote>>;

export class SessionManager {
  private driver: Driver | null = null;
  private sessionMeta: StartSessionResponse | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatFailures = 0;
  private onSessionLost: (() => void) | null = null;

  constructor(private readonly logger: Logger) {}

  /** Registered by the daemon so element references can be flushed on session loss. */
  setSessionLostHandler(handler: () => void): void {
    this.onSessionLost = handler;
  }

  private startHeartbeat(): void {
    this.heartbeatFailures = 0;
    this.heartbeatTimer = setInterval(() => {
      void this.beat();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private async beat(): Promise<void> {
    if (this.driver === null) return;
    const sessionId = this.sessionMeta?.sessionId;

    try {
      await this.driver.getTimeouts();
      this.heartbeatFailures = 0;
      this.logger.debug({ sessionId }, 'Heartbeat ok');
    } catch (err) {
      this.heartbeatFailures += 1;
      this.logger.warn(
        { err, sessionId, failures: this.heartbeatFailures },
        'Heartbeat failed',
      );

      // A session that stopped answering is gone. Tearing it down here means the
      // next command fails with a clean SESSION_NOT_ACTIVE instead of a raw
      // WebDriver error the CLI cannot explain.
      if (this.heartbeatFailures >= HEARTBEAT_FAILURE_LIMIT) {
        this.logger.error(
          { sessionId, failures: this.heartbeatFailures },
          'Session unresponsive — discarding it',
        );
        this.discard();
      }
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatFailures = 0;
  }

  /** Drops local session state without talking to the (unreachable) device. */
  private discard(): void {
    this.stopHeartbeat();
    this.driver = null;
    this.sessionMeta = null;
    this.onSessionLost?.();
  }

  async startSession(req: StartSessionRequest): Promise<StartSessionResponse> {
    if (this.driver !== null) {
      throw new SessionAlreadyActiveError();
    }

    const server = req.server ?? {};
    const opts = {
      hostname: server.hostname ?? APPIUM_DEFAULT_HOST,
      port: server.port ?? APPIUM_DEFAULT_PORT,
      path: server.path ?? APPIUM_DEFAULT_PATH,
      capabilities: req.capabilities as WebdriverIO.Capabilities,
      logLevel: 'error' as const,
    };

    this.logger.info(
      { hostname: opts.hostname, port: opts.port },
      'Starting Appium session',
    );

    const driver = await remote(opts);
    await driver.setTimeout({ implicit: DEFAULT_IMPLICIT_TIMEOUT_MS });

    const meta: StartSessionResponse = {
      sessionId: driver.sessionId,
      capabilities: driver.capabilities as Record<string, unknown>,
      startedAt: new Date().toISOString(),
    };

    this.driver = driver;
    this.sessionMeta = meta;
    this.startHeartbeat();

    this.logger.info({ sessionId: meta.sessionId }, 'Session started');
    return meta;
  }

  async endSession(): Promise<void> {
    if (this.driver === null) {
      throw new SessionNotActiveError();
    }

    this.logger.info({ sessionId: this.sessionMeta?.sessionId }, 'Ending session');

    this.stopHeartbeat();

    try {
      await this.driver.deleteSession();
    } catch (err) {
      this.logger.warn({ err }, 'Error while deleting session (may already be gone)');
    } finally {
      this.driver = null;
      this.sessionMeta = null;
      this.onSessionLost?.();
    }
  }

  getDriver(): Driver {
    if (this.driver === null) {
      throw new SessionNotActiveError();
    }
    return this.driver;
  }

  getSessionMeta(): StartSessionResponse | null {
    return this.sessionMeta;
  }

  isActive(): boolean {
    return this.driver !== null;
  }

  getSessionId(): string | null {
    return this.sessionMeta?.sessionId ?? null;
  }

  // -------------------------------------------------------------------------
  // Contexts (native <-> webview)
  // -------------------------------------------------------------------------

  async getContexts(): Promise<ContextsResponse> {
    const driver = this.getDriver();
    const [contexts, current] = await Promise.all([
      driver.getContexts(),
      driver.getContext(),
    ]);
    return {
      current: normalizeContext(current),
      contexts: (contexts as unknown[])
        .map(contextName)
        .filter((c): c is string => c !== null),
    };
  }

  async switchContext(name: string): Promise<ContextsResponse> {
    const driver = this.getDriver();
    const available = await this.getContexts();

    if (!available.contexts.includes(name)) {
      throw new ContextNotFoundError(name, available.contexts);
    }

    await driver.switchContext(name);
    this.logger.info({ context: name }, 'Switched context');
    return { current: name, contexts: available.contexts };
  }

  async getDeviceInfo(): Promise<DeviceInfoResponse> {
    const driver = this.getDriver();
    const caps = (this.sessionMeta?.capabilities ?? {}) as Record<string, unknown>;

    const [window, orientation, context] = await Promise.all([
      driver.getWindowSize(),
      driver.getOrientation().catch(() => null),
      driver.getContext().catch(() => null),
    ]);

    return {
      platformName: asString(caps['platformName']),
      platformVersion: asString(
        caps['platformVersion'] ?? caps['appium:platformVersion'],
      ),
      deviceName: asString(caps['deviceName'] ?? caps['appium:deviceName']),
      window: { width: window.width, height: window.height },
      orientation: asString(orientation),
      context: normalizeContext(context),
    };
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** `getContext()` returns a string on most drivers but an object on some. */
function normalizeContext(value: unknown): string | null {
  return contextName(value);
}

function contextName(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}
