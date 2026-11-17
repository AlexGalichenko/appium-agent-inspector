import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { addSourceOption, printScreen, screenAfter } from '../screen.js';

export function registerActivateApp(program: Command): void {
  const out = makeOutput(program);

  addSourceOption(program.command('activate-app'))
    .description('Bring an app to the foreground by bundle ID / package name')
    .argument('<appId>', 'Bundle ID (iOS) or package name (Android)')
    .action(async (appId: string, opts: { source: boolean }) => {
      const client = await DaemonClient.fromDaemonState();
      await client.activateApp({ appId });
      const screen = await screenAfter(client, opts);
      out.emit({ activated: true, ...screen }, () => {
        console.log(`Activated ${appId}.`);
        printScreen(screen);
      });
    });
}
