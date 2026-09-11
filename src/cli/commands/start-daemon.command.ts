import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { parseInteger } from '../parse.js';
import { AppiumAgentError } from '../../shared/errors.js';
import { DAEMON_LOG_FILE } from '../../shared/constants.js';
import { acquireStartLock } from '../../shared/start-lock.js';
import {
  ensureConfigDir,
  findRunningDaemon,
  readDaemonState,
} from '../../shared/state-file.js';
import type { DaemonState } from '../../shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/cli/commands/ -> dist/daemon/index.js
const DAEMON_ENTRY = join(__dirname, '..', '..', 'daemon', 'index.js');

const STARTUP_TIMEOUT_MS = 15_000;
const STARTUP_POLL_MS = 250;

export function registerStartDaemon(program: Command): void {
  const out = makeOutput(program);

  program
    .command('daemon:start')
    .description('Start the Appium daemon server in the background')
    .option('--foreground', 'Run daemon in the foreground (non-detached)', false)
    .option(
      '--port <port>',
      'Port to bind (default: 47321, falls back to the next free one)',
    )
    .action(async (opts: { foreground: boolean; port?: string }) => {
      const port =
        opts.port === undefined
          ? undefined
          : parseInteger(opts.port, '--port', { min: 1, max: 65535 });

      // Held until the new daemon answers, so a concurrent daemon:start waits
      // and then finds it, rather than spawning a second daemon.
      const releaseLock = await acquireStartLock(STARTUP_TIMEOUT_MS * 2);
      try {
        // A live health check, not just a PID probe: after a crash the recorded
        // PID can belong to an unrelated process.
        const running = await findRunningDaemon();
        if (running !== null) {
          out.emit({ started: false, alreadyRunning: true, ...running }, () =>
            console.log(
              `Daemon already running (pid: ${running.pid}, port: ${running.port})`,
            ),
          );
          return;
        }

        const args = port === undefined ? [] : ['--port', String(port)];

        if (opts.foreground) {
          const proc = spawn(process.execPath, [DAEMON_ENTRY, ...args], {
            stdio: 'inherit',
            env: process.env,
          });
          await waitForStartup(proc);
          proc.on('exit', (code) => process.exit(code ?? 0));
          return;
        }

        // Detached mode still needs its output somewhere: discarding it makes
        // every startup failure (a busy port, a bad Node version) invisible.
        await ensureConfigDir();
        const logFd = openSync(DAEMON_LOG_FILE, 'a', 0o600);
        const proc = spawn(process.execPath, [DAEMON_ENTRY, ...args], {
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: process.env,
        });
        closeSync(logFd); // the child holds its own copy
        proc.unref();

        const state = await waitForStartup(proc);
        out.emit({ started: true, ...state }, () =>
          console.log(
            `Daemon started (pid: ${state.pid}, port: ${state.port})\nLog: ${DAEMON_LOG_FILE}`,
          ),
        );
      } finally {
        await releaseLock();
      }
    });
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
