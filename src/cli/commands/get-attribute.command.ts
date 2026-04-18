import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { LocatorStrategySchema } from '../../shared/types.js';

export function registerGetAttribute(program: Command): void {
  program
    .command('get-attribute')
    .description('Get an attribute value of an element')
    .requiredOption('--attribute <name>', 'Attribute name to retrieve')
    .option('--element-id <id>', 'Stored element reference ID')
    .option('--strategy <strategy>', 'Locator strategy')
    .option('--selector <selector>', 'Element selector')
    .action(async (opts: { attribute: string; elementId?: string; strategy?: string; selector?: string }) => {
      const client = await DaemonClient.fromDaemonState();
      const target = opts.elementId
        ? { elementId: opts.elementId }
        : { strategy: LocatorStrategySchema.parse(opts.strategy), selector: opts.selector! };
      const result = await client.getAttribute({ ...target, attribute: opts.attribute });
      console.log(`${result.attribute}: ${result.value}`);
    });
}
