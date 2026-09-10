import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { addTargetOptions, resolveTarget } from '../target.js';
import type { TargetOptions } from '../target.js';

export function registerGetAttribute(program: Command): void {
  const out = makeOutput(program);

  addTargetOptions(
    program
      .command('get-attribute')
      .description('Get an attribute value of an element')
      .requiredOption('--attribute <name>', 'Attribute name to retrieve'),
  ).action(async (opts: TargetOptions & { attribute: string }) => {
    const target = resolveTarget(opts);
    const client = await DaemonClient.fromDaemonState();
    const result = await client.getAttribute({ ...target, attribute: opts.attribute });
    out.emit(result, () => console.log(`${result.attribute}: ${result.value}`));
  });
}
