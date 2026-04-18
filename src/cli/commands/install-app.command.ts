import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerInstallApp(program: Command): void {
  program
    .command('install-app')
    .description('Install an app on the device')
    .argument('<appPath>', 'Path to the app file (.ipa, .apk, or .app)')
    .action(async (appPath: string) => {
      const client = await DaemonClient.fromDaemonState();
      await client.installApp({ appPath });
      console.log(`App installed: ${appPath}`);
    });
}
