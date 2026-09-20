import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { parseStrategy } from '../parse.js';
import { parseIndex } from '../target.js';
import { LocatorStrategySchema } from '../../shared/types.js';

export function registerFindElement(program: Command): void {
  const out = makeOutput(program);

  program
    .command('find-element')
    .description('Find an element and store a reference for reuse')
    .requiredOption(
      '--strategy <strategy>',
      `Locator strategy: ${LocatorStrategySchema.options.join(', ')}`,
    )
    .requiredOption('--selector <selector>', 'Element selector value')
    .option('--index <n>', 'Which match to store when the selector is ambiguous', '0')
    .option('--all', 'Store a reference for every match instead of just one', false)
    .action(
      async (opts: {
        strategy: string;
        selector: string;
        index: string;
        all: boolean;
      }) => {
        const req = {
          strategy: parseStrategy(opts.strategy),
          selector: opts.selector,
          index: parseIndex(opts.index),
          all: opts.all,
        };
        const client = await DaemonClient.fromDaemonState();

        if (opts.all) {
          const result = await client.findElements(req);
          out.emit(result, () => {
            console.log(`${result.matchCount} element(s) found:`);
            for (const el of result.elements) {
              console.log(`  [${el.index}] ID: ${el.elementId}`);
            }
          });
          return;
        }

        const result = await client.findElement(req);
        // Strategy and selector are echoes of the flags just passed in, and the
        // timestamp is never acted on; --json still carries all of it.
        out.emit(result, () => {
          console.log(`ID: ${result.elementId}`);
          if (result.matchCount > 1) {
            console.log(
              `  Note: selector matches ${result.matchCount} elements; stored index ${result.index}. Use --index or --all to reach the others.`,
            );
          }
        });
      },
    );
}
