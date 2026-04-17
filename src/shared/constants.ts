import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('../..', import.meta.url));

export const DAEMON_PORT = Number(process.env['DAEMON_PORT'] ?? 47321);
export const DAEMON_HOST = '127.0.0.1';

export const CONFIG_DIR = join(__dirname, '.appium-agent');
export const DAEMON_STATE_FILE = join(CONFIG_DIR, 'daemon.json');

export const APPIUM_DEFAULT_HOST = 'localhost';
export const APPIUM_DEFAULT_PORT = 4723;
export const APPIUM_DEFAULT_PATH = '/';

export const DEFAULT_IMPLICIT_TIMEOUT_MS = 5000;
