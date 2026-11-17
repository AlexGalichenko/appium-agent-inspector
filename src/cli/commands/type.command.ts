import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { addSourceOption, printScreen, screenAfter } from '../screen.js';
import { addTargetOptions, resolveTarget } from '../target.js';
import type { TargetOptions } from '../target.js';

export function registerType(program: Command): void {
  const out = makeOutput(program);

  addSourceOption(
    addTargetOptions(
      program
        .command('type')
        .description('Type text into an element (by stored reference ID or locator)')
        .requiredOption('--text <text>', 'Text to type')
        .option('--clear', 'Clear the field before typing', false),
    ),
  ).action(
    async (opts: TargetOptions & { text: string; clear: boolean; source: boolean }) => {
      const target = resolveTarget(opts);
      const client = await DaemonClient.fromDaemonState();
      await client.type({ ...target, text: opts.text, clearFirst: opts.clear });
      const screen = await screenAfter(client, opts);
      out.emit({ typed: true, ...screen }, () => {
        console.log('Text entered.');
        printScreen(screen);
      });
    },
  );
}
