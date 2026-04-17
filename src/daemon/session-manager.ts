import { remote } from 'webdriverio';
import {
  SessionAlreadyActiveError,
  SessionNotActiveError,
} from '../shared/errors.js';
import type {
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

export class SessionManager {
  private driver: Awaited<ReturnType<typeof remote>> | null = null;
  private sessionMeta: StartSessionResponse | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly logger: Logger) {}

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      void (async () => {
        if (this.driver === null) return;
        try {
          await this.driver.getTimeouts();
          this.logger.debug({ sessionId: this.sessionMeta?.sessionId }, 'Heartbeat ok');
        } catch (err) {
          this.logger.warn({ err, sessionId: this.sessionMeta?.sessionId }, 'Heartbeat failed');
        }
      })();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
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

    this.logger.info({ hostname: opts.hostname, port: opts.port }, 'Starting Appium session');

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
    }
  }

  getDriver(): Awaited<ReturnType<typeof remote>> {
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
}
