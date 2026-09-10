import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { toAccessibilityYaml } from '../accessibility-tree.js';

export function registerPageSource(program: Command): void {
  const out = makeOutput(program);

  program
    .command('page-source')
    .description('Get the current screen as a compact accessibility tree')
    .option('--raw', 'Print full raw XML instead of the accessibility tree', false)
    .option('--bounds', 'Include element centre coordinates and size', false)
    .action(async (opts: { raw: boolean; bounds: boolean }) => {
      const client = await DaemonClient.fromDaemonState();
      const result = await client.getPageSource();
      const rendered = opts.raw
        ? result.source
        : toAccessibilityYaml(result.source, { bounds: opts.bounds });

      out.emit({ capturedAt: result.capturedAt, tree: rendered }, () =>
        console.log(rendered),
      );
    });
}
