import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { readScreen, readScreenDiff } from '../screen.js';

export function registerPageSource(program: Command): void {
  const out = makeOutput(program);

  program
    .command('page-source')
    .description('Get the current screen as a compact accessibility tree')
    .option('--raw', 'Print full raw XML instead of the accessibility tree', false)
    .option('--bounds', 'Include element centre coordinates and size', false)
    .option('--no-collapse', 'List every repeated sibling in full')
    .option(
      '--diff',
      'Print only what changed since the last read (full tree for a new screen)',
      false,
    )
    .action(
      async (opts: {
        raw: boolean;
        bounds: boolean;
        collapse: boolean;
        diff: boolean;
      }) => {
        const client = await DaemonClient.fromDaemonState();

        if (opts.raw) {
          const { source } = await client.getPageSource();
          out.emit({ tree: source }, () => console.log(source));
          return;
        }

        const options = { bounds: opts.bounds, collapse: opts.collapse };
        const result = opts.diff
          ? await readScreenDiff(client, options)
          : { tree: await readScreen(client, options) };
        out.emit(result, () => console.log('diff' in result ? result.diff : result.tree));
      },
    );
}
