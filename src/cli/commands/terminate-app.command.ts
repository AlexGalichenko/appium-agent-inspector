import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerTerminateApp(program: Command): void {
  const out = makeOutput(program);

  program
    .command('terminate-app')
    .description('Stop a running app without ending the session')
    .argument('<appId>', 'Bundle ID (iOS) or package name (Android)')
    .action(async (appId: string) => {
      const client = await DaemonClient.fromDaemonState();
      const terminated = await client.terminateApp({ appId });
      out.emit({ terminated, appId }, () =>
        console.log(terminated ? `Terminated ${appId}.` : `${appId} was not running.`),
      );
    });
}
