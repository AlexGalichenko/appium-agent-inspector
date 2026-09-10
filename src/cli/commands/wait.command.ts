import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { ValidationError } from '../../shared/errors.js';
import { LocatorStrategySchema, WaitConditionSchema } from '../../shared/types.js';

export function registerWait(program: Command): void {
  const out = makeOutput(program);

  program
    .command('wait')
    .description('Wait for an element to reach a condition before continuing')
    .requiredOption('--strategy <strategy>', 'Locator strategy')
    .requiredOption('--selector <selector>', 'Element selector value')
    .option(
      '--for <condition>',
      `One of: ${WaitConditionSchema.options.join(', ')}`,
      'displayed',
    )
    .option('--timeout <ms>', 'How long to wait before failing', '10000')
    .action(
      async (opts: {
        strategy: string;
        selector: string;
        for: string;
        timeout: string;
      }) => {
        const strategy = LocatorStrategySchema.safeParse(opts.strategy);
        if (!strategy.success) {
          throw new ValidationError(
            `Unknown locator strategy "${opts.strategy}". Valid strategies: ${LocatorStrategySchema.options.join(', ')}`,
          );
        }

        const condition = WaitConditionSchema.safeParse(opts.for);
        if (!condition.success) {
          throw new ValidationError(
            `Unknown condition "${opts.for}". Valid conditions: ${WaitConditionSchema.options.join(', ')}`,
          );
        }

        const timeout = Number(opts.timeout);
        if (!Number.isInteger(timeout) || timeout <= 0) {
          throw new ValidationError(
            `--timeout must be a positive integer, got "${opts.timeout}".`,
          );
        }

        const client = await DaemonClient.fromDaemonState();
        const result = await client.waitForElement({
          strategy: strategy.data,
          selector: opts.selector,
          condition: condition.data,
          timeout,
        });

        out.emit(result, () =>
          console.log(
            `"${result.selector}" is ${result.condition} (after ${result.waitedMs}ms).`,
          ),
        );
      },
    );
}
