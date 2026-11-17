import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { addSourceOption, printScreen, screenAfter } from '../screen.js';
import { parseChoice, parseInteger, parseStrategy } from '../parse.js';
import { DEFAULT_WAIT_TIMEOUT_MS } from '../../shared/constants.js';
import { WaitConditionSchema } from '../../shared/types.js';

/** Mirrors the daemon's WaitRequestSchema bound, so it fails before any request. */
const MAX_WAIT_TIMEOUT_MS = 600_000;

export function registerWait(program: Command): void {
  const out = makeOutput(program);

  addSourceOption(program.command('wait'))
    .description('Wait for an element to reach a condition before continuing')
    .requiredOption('--strategy <strategy>', 'Locator strategy')
    .requiredOption('--selector <selector>', 'Element selector value')
    .option(
      '--for <condition>',
      `One of: ${WaitConditionSchema.options.join(', ')}`,
      'displayed',
    )
    .option(
      '--timeout <ms>',
      'How long to wait before failing',
      String(DEFAULT_WAIT_TIMEOUT_MS),
    )
    .action(
      async (opts: {
        strategy: string;
        selector: string;
        for: string;
        timeout: string;
        source: boolean;
      }) => {
        const client = await DaemonClient.fromDaemonState();
        const result = await client.waitForElement({
          strategy: parseStrategy(opts.strategy),
          selector: opts.selector,
          condition: parseChoice(
            WaitConditionSchema.options,
            opts.for,
            'condition',
            'conditions',
          ),
          timeout: parseInteger(opts.timeout, '--timeout', {
            min: 1,
            max: MAX_WAIT_TIMEOUT_MS,
          }),
        });

        const screen = await screenAfter(client, opts);
        out.emit({ ...result, ...screen }, () => {
          console.log(`OK after ${result.waitedMs}ms.`);
          printScreen(screen);
        });
      },
    );
}
