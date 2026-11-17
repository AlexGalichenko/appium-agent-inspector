import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { addTargetOptions, resolveTarget } from '../target.js';
import type { TargetOptions } from '../target.js';

export function registerGetLocation(program: Command): void {
  const out = makeOutput(program);

  addTargetOptions(
    program
      .command('get-location')
      .description('Get the position and size of an element on screen'),
  ).action(async (opts: TargetOptions) => {
    const target = resolveTarget(opts);
    const client = await DaemonClient.fromDaemonState();
    const rect = await client.getElementLocation(target);
    const center = {
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    };
    // Same `@centreX,centreY WxH` notation as `page-source --bounds`.
    out.emit({ ...rect, center }, () =>
      console.log(`@${center.x},${center.y} ${rect.width}x${rect.height}`),
    );
  });
}
