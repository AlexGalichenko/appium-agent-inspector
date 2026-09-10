import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerInstallApp(program: Command): void {
  const out = makeOutput(program);

  program
    .command('install-app')
    .description('Install an .apk or .ipa onto the device')
    .argument('<appPath>', 'Path to the application package')
    .action(async (appPath: string) => {
      const client = await DaemonClient.fromDaemonState();
      await client.installApp({ appPath });
      out.emit({ installed: true, appPath }, () => console.log(`Installed ${appPath}.`));
    });
}
