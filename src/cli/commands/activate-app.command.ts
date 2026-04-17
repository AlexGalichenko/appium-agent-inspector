import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerActivateApp(program: Command): void {
  program
    .command('activate-app')
    .description('Bring an app to the foreground (iOS: bundleId, Android: package name)')
    .argument('<appId>', 'App identifier (bundle ID or package name)')
    .action(async (appId: string) => {
      const client = await DaemonClient.fromDaemonState();
      await client.activateApp({ appId });
      console.log(`App activated: ${appId}`);
    });
}
