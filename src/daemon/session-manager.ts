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

export interface SessionManagerOptions {
  /** End the session after this long without a request. 0 (the default) disables it. */
  idleTimeoutMs?: number;
}

export class SessionManager {
  private driver: Driver | null = null;
  private sessionMeta: StartSessionResponse | null = null;
  private starting = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatFailures = 0;
  private heartbeatInFlight = false;
  private lastActivityAt = Date.now();
  private readonly implicitWaitOverrides = new WeakMap<Driver, number>();
  private readonly idleTimeoutMs: number;
  private onSessionLost: (() => void) | null = null;

  constructor(
    private readonly logger: Logger,
    options: SessionManagerOptions = {},
  ) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 0;
  }

  /** Registered by the daemon so element references can be flushed on session loss. */
  setSessionLostHandler(handler: () => void): void {
    this.onSessionLost = handler;
  }

  /** Records client activity, postponing the idle timeout. */
  touch(): void {
    this.lastActivityAt = Date.now();
  }

  private startHeartbeat(): void {
    this.heartbeatFailures = 0;
    this.heartbeatTimer = setInterval(() => {
      void this.beat();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private async beat(): Promise<void> {
    const driver = this.driver;
    if (driver === null) return;

    // Behind a long command (an install, a video stop) a beat can wait on the
    // Appium server for longer than the interval. Stacking more beats behind
    // it would count each as another failure and discard a healthy session.
    if (this.heartbeatInFlight) return;

    const sessionId = this.sessionMeta?.sessionId;

    const idleMs = Date.now() - this.lastActivityAt;
    if (this.idleTimeoutMs > 0 && idleMs >= this.idleTimeoutMs) {
      this.logger.warn(
        { sessionId, idleMs },
        'Session idle — ending it to release the device',
      );
      await this.endSession().catch(() => undefined);
      return;
    }

    this.heartbeatInFlight = true;
    try {
      await driver.getTimeouts();
      // The session this beat checked may have been replaced while it waited.
      if (this.driver !== driver) return;
      this.heartbeatFailures = 0;
      this.logger.debug({ sessionId }, 'Heartbeat ok');
    } catch (err) {
      if (this.driver !== driver) return;
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
    } finally {
      this.heartbeatInFlight = false;
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

  /** Called when the Appium server reports that it no longer knows the session. */
  markSessionLost(): void {
    if (this.driver === null) return;
    this.logger.warn(
      { sessionId: this.sessionMeta?.sessionId },
      'Appium no longer knows the session — discarding it',
    );
    this.discard();
  }

  async startSession(req: StartSessionRequest): Promise<StartSessionResponse> {
    if (this.driver !== null) {
      throw new SessionAlreadyActiveError();
    }
    // The driver is only assigned once Appium answers, which can take a minute.
    // Without this guard a second connect in that window opens a second
    // session, and whichever loses the race is leaked on the Appium server.
    if (this.starting) {
      throw new SessionAlreadyActiveError(
        'A session is already being started. Wait for connect to finish.',
      );
    }
    this.starting = true;

    try {
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
      try {
        await driver.setTimeout({ implicit: DEFAULT_IMPLICIT_TIMEOUT_MS });
      } catch (err) {
        // The session already exists on the Appium server; abandoning it here
        // would hold the device until Appium's own timeout.
        await driver.deleteSession().catch(() => undefined);
        throw err;
      }

      const meta: StartSessionResponse = {
        sessionId: driver.sessionId,
        capabilities: driver.capabilities as Record<string, unknown>,
        startedAt: new Date().toISOString(),
      };

      this.driver = driver;
      this.sessionMeta = meta;
      this.touch();
      this.startHeartbeat();

      this.logger.info({ sessionId: meta.sessionId }, 'Session started');
      return meta;
    } finally {
      this.starting = false;
    }
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

  /**
   * Runs `fn` with the implicit wait at zero.
   *
   * Polling code (waits, scroll visibility checks) must see an absent element
   * at once: under the default implicit wait every negative lookup blocks for
   * the full timeout, multiplying a poll loop's duration. Overlapping calls on
   * the same session share one override, restored when the last finishes.
   */
  async withoutImplicitWait<T>(fn: (driver: Driver) => Promise<T>): Promise<T> {
    const driver = this.getDriver();
    const depth = this.implicitWaitOverrides.get(driver) ?? 0;
    this.implicitWaitOverrides.set(driver, depth + 1);

    try {
      if (depth === 0) await driver.setTimeout({ implicit: 0 });
      return await fn(driver);
    } finally {
      const remaining = (this.implicitWaitOverrides.get(driver) ?? 1) - 1;
      this.implicitWaitOverrides.set(driver, remaining);
      if (remaining === 0 && this.driver === driver) {
        await driver
          .setTimeout({ implicit: DEFAULT_IMPLICIT_TIMEOUT_MS })
          .catch((err: unknown) =>
            this.logger.warn({ err }, 'Could not restore the implicit wait'),
          );
      }
    }
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
