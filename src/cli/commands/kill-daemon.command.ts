import type { Command } from 'commander';
import { isDaemonProcessAlive, readDaemonState, removeDaemonState } from '../../daemon/pid-file.js';
import { DaemonNotRunningError } from '../../shared/errors.js';

export function registerKillDaemon(program: Command): void {
  program
    .command('daemon:kill')
    .description('Kill the running Appium daemon process by PID')
    .action(async () => {
      const state = await readDaemonState();
      if (state === null || !isDaemonProcessAlive(state.pid)) {
        throw new DaemonNotRunningError();
      }
      process.kill(state.pid, 'SIGTERM');
      await removeDaemonState();
      console.log(`Daemon process ${state.pid} killed.`);
    });
}
