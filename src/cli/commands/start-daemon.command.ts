import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { ValidationError } from '../../shared/errors.js';
import { DAEMON_LOG_FILE } from '../../shared/constants.js';
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
      const port = parsePort(opts.port);

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
        proc.on('exit', (code) => process.exit(code ?? 0));
        return;
      }

      // Detached mode still needs its output somewhere: discarding it makes
      // every startup failure (a busy port, a bad Node version) invisible.
      await ensureConfigDir();
      const logFd = openSync(DAEMON_LOG_FILE, 'a');

      const proc = spawn(process.execPath, [DAEMON_ENTRY, ...args], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: process.env,
      });
      proc.unref();

      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      let state: DaemonState | null = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
        state = await readDaemonState();
        if (
          state !== null &&
          (await DaemonClient.default(state.port, state.token).healthCheck())
        ) {
          break;
        }
        state = null;
      }

      if (state === null) {
        console.error(
          `Daemon did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s.\nLog: ${DAEMON_LOG_FILE}`,
        );
        process.exit(1);
      }

      out.emit({ started: true, ...state }, () =>
        console.log(
          `Daemon started (pid: ${state.pid}, port: ${state.port})\nLog: ${DAEMON_LOG_FILE}`,
        ),
      );
    });
}

function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ValidationError(
      `--port must be an integer between 1 and 65535, got "${raw}".`,
    );
  }
  return port;
}
