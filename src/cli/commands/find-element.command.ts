import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { LocatorStrategySchema } from '../../shared/types.js';

export function registerFindElement(program: Command): void {
  program
    .command('find-element')
    .description('Find an element and store a reference for reuse')
    .requiredOption(
      '--strategy <strategy>',
      'Locator strategy: accessibility id, id, xpath, class name, -android uiautomator, -ios predicate string, -ios class chain',
    )
    .requiredOption('--selector <selector>', 'Element selector value')
    .action(async (opts: { strategy: string; selector: string }) => {
      const strategy = LocatorStrategySchema.parse(opts.strategy);
      const client = await DaemonClient.fromDaemonState();
      const result = await client.findElement({ strategy, selector: opts.selector });

      console.log(`Element found:`);
      console.log(`  ID:       ${result.elementId}`);
      console.log(`  Strategy: ${result.strategy}`);
      console.log(`  Selector: ${result.selector}`);
      console.log(`  Found at: ${result.foundAt}`);
    });
}
