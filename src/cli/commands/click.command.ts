import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { addSourceOption, printScreen, screenAfter } from '../screen.js';
import { addTargetOptions, resolveTarget } from '../target.js';
import type { TargetOptions } from '../target.js';

export function registerClick(program: Command): void {
  const out = makeOutput(program);

  addSourceOption(
    addTargetOptions(
      program
        .command('click')
        .description('Click an element (by stored reference ID or locator)'),
    ),
  ).action(async (opts: TargetOptions & { source: boolean }) => {
    const target = resolveTarget(opts);
    const client = await DaemonClient.fromDaemonState();
    await client.click(target);
    const screen = await screenAfter(client, opts);
    out.emit({ clicked: true, ...screen }, () => {
      console.log('Clicked.');
      printScreen(screen);
    });
  });
}
