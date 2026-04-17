import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerCloseApp(program: Command): void {
  program
    .command('close-app')
    .description('Close the current app and terminate the Appium session')
    .action(async () => {
      const client = await DaemonClient.fromDaemonState();
      await client.endSession();
      console.log('Session closed.');
    });
}
