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

      const data = status.active
        ? { active: true, sessionId: status.sessionId, startedAt: status.startedAt }
        : { active: false };
      out.emit(data, () => {
        if (!status.active) {
          console.log('No active session. Run connect first.');
          return;
        }
        console.log(`Active session: ${status.sessionId} (since ${status.startedAt})`);
      });
    });
}
