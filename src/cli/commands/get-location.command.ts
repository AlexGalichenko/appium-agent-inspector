import type { Command } from 'commander';
import type { GetLocationRequest } from '../../shared/types.js';
import { DaemonClient } from '../daemon-client.js';

export function registerGetLocation(program: Command): void {
  program
    .command('get-location')
    .description('Get the position and size of an element')
    .option('--element-id <id>', 'Stored element reference ID')
    .option('--strategy <strategy>', 'Locator strategy')
    .option('--selector <value>', 'Element selector')
    .action(async (opts: { elementId?: string; strategy?: string; selector?: string }) => {
      const client = await DaemonClient.fromDaemonState();

      const req: GetLocationRequest = opts.elementId
        ? { elementId: opts.elementId }
        : { strategy: opts.strategy as GetLocationRequest extends { strategy: infer S } ? S : never, selector: opts.selector as string };

      const rect = await client.getElementLocation(req);

      console.log(`x: ${rect.x}`);
      console.log(`y: ${rect.y}`);
      console.log(`width: ${rect.width}`);
      console.log(`height: ${rect.height}`);
    });
}
