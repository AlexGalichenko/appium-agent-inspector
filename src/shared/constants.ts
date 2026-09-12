import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Reads an integer from the first set environment variable in `names`.
 *
 * A malformed value falls back to the default with a warning on stderr rather
 * than becoming `NaN` and failing somewhere far from its cause.
 */
function envInteger(
  names: string[],
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') continue;

    const value = Number(raw);
    if (Number.isInteger(value) && value >= min && value <= max) return value;

    console.warn(
      `Ignoring ${name}="${raw}": expected an integer between ${min} and ${max}. Using ${fallback}.`,
    );
    return fallback;
  }
  return fallback;
}

/** `DAEMON_PORT` is the pre-0.4 name, still honoured when the new one is unset. */
export const DEFAULT_DAEMON_PORT = envInteger(
  ['APPIUM_AGENT_PORT', 'DAEMON_PORT'],
  47321,
  {
    min: 1,
    max: 65535,
  },
);
export const DAEMON_HOST = '127.0.0.1';

/**
 * Runtime state lives in the user's home directory, never inside the installed
 * package: a package directory may be read-only (global installs), is wiped on
 * every reinstall, and is shared by every project on the machine.
 */
function resolveConfigDir(): string {
  const override = process.env['APPIUM_AGENT_HOME'];
  if (override !== undefined && override !== '') return override;

  const xdgState = process.env['XDG_STATE_HOME'];
  if (xdgState !== undefined && xdgState !== '') return join(xdgState, 'appium-agent');

  return join(homedir(), '.appium-agent');
}

export const CONFIG_DIR = resolveConfigDir();
export const DAEMON_STATE_FILE = join(CONFIG_DIR, 'daemon.json');
export const DAEMON_LOG_FILE = join(CONFIG_DIR, 'daemon.log');
export const DAEMON_START_LOCK_FILE = join(CONFIG_DIR, 'daemon-start.lock');

export const DAEMON_TOKEN_HEADER = 'x-appium-agent-token';

export const APPIUM_DEFAULT_HOST = 'localhost';
export const APPIUM_DEFAULT_PORT = 4723;
export const APPIUM_DEFAULT_PATH = '/';

export const DEFAULT_IMPLICIT_TIMEOUT_MS = 5000;
export const DEFAULT_WAIT_TIMEOUT_MS = 10_000;

export const DEFAULT_SCROLL_MAX_SWIPES = 10;
export const DEFAULT_SCROLL_DURATION_MS = 600;
/** Per-swipe allowance for the visibility check that follows each swipe. */
export const SCROLL_CHECK_ALLOWANCE_MS = 3000;

/**
 * An agent that walks away leaves its session holding the device forever: the
 * heartbeat stops Appium's own `newCommandTimeout` from ever firing. After this
 * long without a request the daemon ends the session itself. 0 disables it.
 */
export const SESSION_IDLE_TIMEOUT_MS = envInteger(
  ['APPIUM_AGENT_IDLE_TIMEOUT_MS'],
  30 * 60_000,
  { min: 0, max: Number.MAX_SAFE_INTEGER },
);

/** Per-request CLI -> daemon timeouts. Session setup and video need much longer. */
export const CLI_REQUEST_TIMEOUT_MS = 30_000;
export const CLI_LONG_REQUEST_TIMEOUT_MS = 180_000;
