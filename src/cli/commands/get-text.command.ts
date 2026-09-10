import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { addTargetOptions, resolveTarget } from '../target.js';
import type { TargetOptions } from '../target.js';

export function registerGetText(program: Command): void {
  const out = makeOutput(program);

  addTargetOptions(
    program.command('get-text').description('Get the visible text of an element'),
  ).action(async (opts: TargetOptions) => {
    const target = resolveTarget(opts);
    const client = await DaemonClient.fromDaemonState();
    const result = await client.getText(target);
    out.emit(result, () => console.log(result.text));
  });
}
