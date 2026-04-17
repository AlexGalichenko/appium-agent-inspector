import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { LocatorStrategySchema } from '../../shared/types.js';

export function registerClick(program: Command): void {
  program
    .command('click')
    .description('Click an element (by stored reference ID or locator)')
    .option('--element-id <id>', 'Stored element reference ID from find-element')
    .option('--strategy <strategy>', 'Locator strategy (when not using --element-id)')
    .option('--selector <selector>', 'Element selector (when not using --element-id)')
    .action(async (opts: { elementId?: string; strategy?: string; selector?: string }) => {
      const client = await DaemonClient.fromDaemonState();

      if (opts.elementId !== undefined) {
        await client.click({ elementId: opts.elementId });
      } else if (opts.strategy !== undefined && opts.selector !== undefined) {
        const strategy = LocatorStrategySchema.parse(opts.strategy);
        await client.click({ strategy, selector: opts.selector });
      } else {
        console.error('Provide either --element-id or both --strategy and --selector');
        process.exit(1);
      }

      console.log('Clicked.');
    });
}
