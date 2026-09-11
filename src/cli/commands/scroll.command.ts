import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { parseChoice, parseInteger, parseStrategy } from '../parse.js';
import { ValidationError } from '../../shared/errors.js';
import {
  DEFAULT_SCROLL_DURATION_MS,
  DEFAULT_SCROLL_MAX_SWIPES,
} from '../../shared/constants.js';
import { ScrollDirectionSchema } from '../../shared/types.js';
import type { ScrollRequest } from '../../shared/types.js';

/** Mirrors the daemon's ScrollRequestSchema bound, so it fails before any request. */
const MAX_SWIPES_LIMIT = 50;

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
    .option(
      '--max-swipes <n>',
      'Give up after this many swipes',
      String(DEFAULT_SCROLL_MAX_SWIPES),
    )
    .action(
      async (opts: {
        direction: string;
        percent: string;
        toStrategy?: string;
        toSelector?: string;
        maxSwipes: string;
      }) => {
        const percent = Number(opts.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 0.95) {
          throw new ValidationError(
            `--percent must be between 0 and 0.95, got "${opts.percent}".`,
          );
        }

        const req: ScrollRequest = {
          direction: parseChoice(
            ScrollDirectionSchema.options,
            opts.direction,
            'direction',
            'directions',
          ),
          percent,
          maxSwipes: parseInteger(opts.maxSwipes, '--max-swipes', {
            min: 1,
            max: MAX_SWIPES_LIMIT,
          }),
          duration: DEFAULT_SCROLL_DURATION_MS,
        };

        if (opts.toStrategy !== undefined || opts.toSelector !== undefined) {
          if (opts.toStrategy === undefined || opts.toSelector === undefined) {
            throw new ValidationError(
              'Scrolling to an element needs both --to-strategy and --to-selector.',
            );
          }
          req.toElement = {
            strategy: parseStrategy(opts.toStrategy),
            selector: opts.toSelector,
          };
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
