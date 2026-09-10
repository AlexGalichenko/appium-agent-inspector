import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerDeleteSession(program: Command): void {
  const out = makeOutput(program);

  program
    .command('delete-session')
    .description('End the Appium session and release the device')
    .action(async () => {
      const client = await DaemonClient.fromDaemonState();
      await client.endSession();
      out.emit({ closed: true }, () => console.log('Session closed.'));
    });
}
