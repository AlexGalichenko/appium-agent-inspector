import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerTerminateApp(program: Command): void {
  program
    .command('terminate-app')
    .description('Terminate a running app (iOS: bundleId, Android: package name)')
    .argument('<appId>', 'App identifier (bundle ID or package name)')
    .action(async (appId: string) => {
      const client = await DaemonClient.fromDaemonState();
      const terminated = await client.terminateApp({ appId });
      console.log(terminated ? `App terminated: ${appId}` : `App was not running: ${appId}`);
    });
}
