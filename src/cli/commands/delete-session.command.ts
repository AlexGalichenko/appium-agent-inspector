import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerDeleteSession(program: Command): void {
  program
    .command('delete-session')
    .description('Close appium session')
    .action(async () => {
      const client = await DaemonClient.fromDaemonState();
      await client.endSession();
      console.log('Session closed.');
    });
}
