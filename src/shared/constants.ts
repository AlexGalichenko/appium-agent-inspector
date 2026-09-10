import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_DAEMON_PORT = Number(process.env['DAEMON_PORT'] ?? 47321);
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

export const DAEMON_TOKEN_HEADER = 'x-appium-agent-token';

export const APPIUM_DEFAULT_HOST = 'localhost';
export const APPIUM_DEFAULT_PORT = 4723;
export const APPIUM_DEFAULT_PATH = '/';

export const DEFAULT_IMPLICIT_TIMEOUT_MS = 5000;
export const DEFAULT_WAIT_TIMEOUT_MS = 10_000;

/** Per-request CLI -> daemon timeouts. Session setup and video need much longer. */
export const CLI_REQUEST_TIMEOUT_MS = 30_000;
export const CLI_LONG_REQUEST_TIMEOUT_MS = 180_000;
