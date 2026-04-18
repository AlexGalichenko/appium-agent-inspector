import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { toAccessibilityYaml } from '../accessibility-tree.js';

export function registerPageSource(program: Command): void {
  program
    .command('page-source')
    .description('Get the current page XML source')
    .option('--raw', 'Print full raw XML instead of accessibility tree', false)
    .action(async (opts: { raw: boolean }) => {
      const client = await DaemonClient.fromDaemonState();
      const result = await client.getPageSource();
      console.log(opts.raw ? result.source : toAccessibilityYaml(result.source));
    });
}
