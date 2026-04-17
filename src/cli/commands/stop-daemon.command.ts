import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { DaemonNotRunningError } from '../../shared/errors.js';

export function registerStopDaemon(program: Command): void {
  program
    .command('daemon:stop')
    .description('Stop the running Appium daemon server')
    .action(async () => {
      try {
        const client = await DaemonClient.fromDaemonState();
        await client.shutdown();
        console.log('Daemon stopped.');
      } catch (err) {
        if (err instanceof DaemonNotRunningError) {
          console.log('Daemon is not running.');
          return;
        }
        throw err;
      }
    });
}
