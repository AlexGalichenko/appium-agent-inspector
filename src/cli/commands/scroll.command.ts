import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { ValidationError } from '../../shared/errors.js';
import { LocatorStrategySchema, ScrollDirectionSchema } from '../../shared/types.js';
import type { ScrollRequest } from '../../shared/types.js';

export function registerScroll(program: Command): void {
  const out = makeOutput(program);

  program
    .command('scroll')
    .description('Scroll the screen, optionally until an element comes into view')
    .option(
      '--direction <direction>',
      `Scroll direction: ${ScrollDirectionSchema.options.join(', ')}`,
      'down',
    )
    .option('--percent <n>', 'Fraction of the screen to travel per swipe', '0.6')
    .option(
      '--to-strategy <strategy>',
      'Scroll until this element exists: locator strategy',
    )
    .option('--to-selector <selector>', 'Scroll until this element exists: selector')
    .option('--max-swipes <n>', 'Give up after this many swipes', '10')
    .action(
      async (opts: {
        direction: string;
        percent: string;
        toStrategy?: string;
        toSelector?: string;
        maxSwipes: string;
      }) => {
        const direction = ScrollDirectionSchema.safeParse(opts.direction);
        if (!direction.success) {
          throw new ValidationError(
            `Unknown direction "${opts.direction}". Valid directions: ${ScrollDirectionSchema.options.join(', ')}`,
          );
        }

        const percent = Number(opts.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 0.95) {
          throw new ValidationError(
            `--percent must be between 0 and 0.95, got "${opts.percent}".`,
          );
        }

        const maxSwipes = Number(opts.maxSwipes);
        if (!Number.isInteger(maxSwipes) || maxSwipes <= 0) {
          throw new ValidationError(
            `--max-swipes must be a positive integer, got "${opts.maxSwipes}".`,
          );
        }

        const req: ScrollRequest = {
          direction: direction.data,
          percent,
          maxSwipes,
          duration: 600,
        };

        if (opts.toStrategy !== undefined || opts.toSelector !== undefined) {
          if (opts.toStrategy === undefined || opts.toSelector === undefined) {
            throw new ValidationError(
              'Scrolling to an element needs both --to-strategy and --to-selector.',
            );
          }
          const strategy = LocatorStrategySchema.safeParse(opts.toStrategy);
          if (!strategy.success) {
            throw new ValidationError(
              `Unknown locator strategy "${opts.toStrategy}". Valid strategies: ${LocatorStrategySchema.options.join(', ')}`,
            );
          }
          req.toElement = { strategy: strategy.data, selector: opts.toSelector };
        }

        const client = await DaemonClient.fromDaemonState();
        const result = await client.scroll(req);

        out.emit(result, () => {
          if (result.found === null) {
            console.log(`Scrolled ${result.direction}.`);
          } else if (result.found) {
            console.log(`Element in view after ${result.swipes} swipe(s).`);
          } else {
            console.log(
              `Element not found after ${result.swipes} swipe(s) scrolling ${result.direction}.`,
            );
          }
        });
      },
    );
}
