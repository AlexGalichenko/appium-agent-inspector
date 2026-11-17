import type { Command } from 'commander';
import { launchDaemon } from '../daemon-launcher.js';
import { makeOutput } from '../output.js';
import { parseInteger } from '../parse.js';
import { DAEMON_LOG_FILE } from '../../shared/constants.js';

export function registerStartDaemon(program: Command): void {
  const out = makeOutput(program);

  program
    .command('daemon:start')
    .description('Start the daemon in the background (connect does this for you)')
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

      const { state, alreadyRunning, child } = await launchDaemon({
        foreground: opts.foreground,
        ...(port !== undefined && { port }),
      });

      if (child !== undefined) {
        child.on('exit', (code) => process.exit(code ?? 0));
        return;
      }

      if (alreadyRunning) {
        out.emit({ started: false, alreadyRunning: true, ...state }, () =>
          console.log(`Daemon already running (pid: ${state.pid}, port: ${state.port})`),
        );
        return;
      }

      out.emit({ started: true, ...state }, () =>
        console.log(
          `Daemon started (pid: ${state.pid}, port: ${state.port})\nLog: ${DAEMON_LOG_FILE}`,
        ),
      );
    });
}
