import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerPageSource(program: Command): void {
  program
    .command('page-source')
    .description('Get the current page XML source')
    .option('--raw', 'Print raw XML without formatting info', false)
    .action(async (opts: { raw: boolean }) => {
      const client = await DaemonClient.fromDaemonState();
      const result = await client.getPageSource();

      if (!opts.raw) {
        console.log(`Captured at: ${result.capturedAt}`);
        console.log('---');
      }
      console.log(result.source);
    });
}
