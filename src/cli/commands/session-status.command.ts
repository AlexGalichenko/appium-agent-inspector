import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerSessionStatus(program: Command): void {
  const out = makeOutput(program);

  program
    .command('session-status')
    .description('Report whether an Appium session is currently active')
    .action(async () => {
      const client = await DaemonClient.fromDaemonState();
      const status = await client.getSessionStatus();

      out.emit(status, () => {
        if (!status.active) {
          console.log('No active session. Run connect first.');
          return;
        }
        console.log(`Active session: ${status.sessionId}`);
        console.log(`Started at: ${status.startedAt}`);
      });
    });
}
