import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DaemonClient } from './daemon-client.js';
import { AppiumAgentError, DaemonNotRunningError } from '../shared/errors.js';
import { DAEMON_LOG_FILE } from '../shared/constants.js';
import { acquireStartLock } from '../shared/start-lock.js';
import {
  ensureConfigDir,
  findRunningDaemon,
  readDaemonState,
} from '../shared/state-file.js';
import type { DaemonState } from '../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/cli/ -> dist/daemon/index.js
const DAEMON_ENTRY = join(__dirname, '..', 'daemon', 'index.js');

const STARTUP_TIMEOUT_MS = 15_000;
const STARTUP_POLL_MS = 250;

export interface LaunchOptions {
  port?: number;
  /** Run attached with inherited stdio; the caller owns the child's lifetime. */
  foreground?: boolean;
}

export interface LaunchResult {
  state: DaemonState;
  alreadyRunning: boolean;
  /** Only set for a foreground launch. */
  child?: ChildProcess;
}

/**
 * Starts the daemon unless a healthy one is already running. Safe to call
 * concurrently: the start lock is held until the new daemon answers, so a
 * second caller waits and then finds it rather than spawning another.
 */
export async function launchDaemon(opts: LaunchOptions = {}): Promise<LaunchResult> {
  const releaseLock = await acquireStartLock(STARTUP_TIMEOUT_MS * 2);
  try {
    // A live health check, not just a PID probe: after a crash the recorded
    // PID can belong to an unrelated process.
    const running = await findRunningDaemon();
    if (running !== null) return { state: running, alreadyRunning: true };

    const args = opts.port === undefined ? [] : ['--port', String(opts.port)];

    if (opts.foreground === true) {
      const child = spawn(process.execPath, [DAEMON_ENTRY, ...args], {
        stdio: 'inherit',
        env: process.env,
      });
      return { state: await waitForStartup(child), alreadyRunning: false, child };
    }

    // Detached mode still needs its output somewhere: discarding it makes
    // every startup failure (a busy port, a bad Node version) invisible.
    await ensureConfigDir();
    const logFd = openSync(DAEMON_LOG_FILE, 'a', 0o600);
    const child = spawn(process.execPath, [DAEMON_ENTRY, ...args], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    });
    closeSync(logFd); // the child holds its own copy
    child.unref();

    return { state: await waitForStartup(child), alreadyRunning: false };
  } finally {
    await releaseLock();
  }
}

/**
 * A client for the running daemon, starting one first if there is none. Only
 * `connect` uses this: every other command needs a session, which a freshly
 * started daemon cannot have, so for them "not running" is the useful answer.
 */
export async function ensureDaemon(launch = launchDaemon): Promise<DaemonClient> {
  try {
    return await DaemonClient.fromDaemonState();
  } catch (err) {
    if (!(err instanceof DaemonNotRunningError)) throw err;
    await launch();
    return DaemonClient.fromDaemonState();
  }
}

/**
 * Polls until the spawned daemon records its state and answers a health check.
 * A daemon that exits during startup fails immediately instead of after the
 * full timeout.
 */
async function waitForStartup(proc: ChildProcess): Promise<DaemonState> {
  const status: { exit: string | null } = { exit: null };
  proc.once('exit', (code, signal) => {
    status.exit = signal === null ? `exit code ${code}` : `signal ${signal}`;
  });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, STARTUP_POLL_MS));

    if (status.exit !== null) {
      throw new AppiumAgentError(
        'DAEMON_START_FAILED',
        `Daemon exited during startup (${status.exit}). Log: ${DAEMON_LOG_FILE}`,
      );
    }

    const state = await readDaemonState();
    // Only the daemon just spawned counts, never an older record.
    if (
      state !== null &&
      state.pid === proc.pid &&
      (await DaemonClient.default(state.port, state.token).healthCheck())
    ) {
      return state;
    }
  }

  throw new AppiumAgentError(
    'DAEMON_START_FAILED',
    `Daemon did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s. Log: ${DAEMON_LOG_FILE}`,
  );
}
