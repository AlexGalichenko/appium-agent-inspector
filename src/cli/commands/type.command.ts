import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { LocatorStrategySchema } from '../../shared/types.js';

export function registerType(program: Command): void {
  program
    .command('type')
    .description('Type text into an element (by stored reference ID or locator)')
    .requiredOption('--text <text>', 'Text to type')
    .option('--element-id <id>', 'Stored element reference ID from find-element')
    .option('--strategy <strategy>', 'Locator strategy (when not using --element-id)')
    .option('--selector <selector>', 'Element selector (when not using --element-id)')
    .option('--clear', 'Clear the field before typing', false)
    .action(async (opts: {
      text: string;
      elementId?: string;
      strategy?: string;
      selector?: string;
      clear: boolean;
    }) => {
      const client = await DaemonClient.fromDaemonState();
      const clearFirst = opts.clear;

      if (opts.elementId !== undefined) {
        await client.type({ elementId: opts.elementId, text: opts.text, clearFirst });
      } else if (opts.strategy !== undefined && opts.selector !== undefined) {
        const strategy = LocatorStrategySchema.parse(opts.strategy);
        await client.type({ strategy, selector: opts.selector, text: opts.text, clearFirst });
      } else {
        console.error('Provide either --element-id or both --strategy and --selector');
        process.exit(1);
      }

      console.log('Text entered.');
    });
}
