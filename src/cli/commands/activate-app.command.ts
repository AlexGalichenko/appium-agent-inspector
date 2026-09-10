import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerActivateApp(program: Command): void {
  const out = makeOutput(program);

  program
    .command('activate-app')
    .description('Bring an app to the foreground by bundle ID / package name')
    .argument('<appId>', 'Bundle ID (iOS) or package name (Android)')
    .action(async (appId: string) => {
      const client = await DaemonClient.fromDaemonState();
      await client.activateApp({ appId });
      out.emit({ activated: true, appId }, () => console.log(`Activated ${appId}.`));
    });
}
