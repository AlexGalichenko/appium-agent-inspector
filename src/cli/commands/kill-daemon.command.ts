import type { Command } from 'commander';
import { makeOutput } from '../output.js';
import {
  isDaemonProcessAlive,
  readDaemonState,
  removeDaemonStateIfOwnedBy,
} from '../../shared/state-file.js';

/** How long to wait for the daemon to exit before reporting it as stuck. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

export function registerKillDaemon(program: Command): void {
  const out = makeOutput(program);

  program
    .command('daemon:kill')
    .description('Stop the running daemon and clean up its state file')
    .action(async () => {
      const state = await readDaemonState();

      if (state === null || !isDaemonProcessAlive(state.pid)) {
        await removeDaemonStateIfOwnedBy(state?.pid ?? -1);
        out.emit({ killed: false, reason: 'not running' }, () =>
          console.log('Daemon is not running.'),
        );
        return;
      }

      process.kill(state.pid, 'SIGTERM');

      // Wait for the process to actually exit. Returning early lets a
      // follow-up daemon:start race the old daemon's own cleanup.
      const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
      while (Date.now() < deadline && isDaemonProcessAlive(state.pid)) {
        await new Promise((r) => setTimeout(r, 100));
      }

      const stopped = !isDaemonProcessAlive(state.pid);
      if (!stopped) {
        console.error(
          `Daemon (pid: ${state.pid}) did not exit within ${SHUTDOWN_TIMEOUT_MS / 1000}s. Send SIGKILL manually if it stays stuck.`,
        );
        process.exit(1);
      }

      await removeDaemonStateIfOwnedBy(state.pid);

      out.emit({ killed: true, pid: state.pid }, () =>
        console.log(`Daemon stopped (pid: ${state.pid}).`),
      );
    });
}
