import { writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerTakeScreenshot(program: Command): void {
  program
    .command('take-screenshot')
    .description('Capture a screenshot of the current device screen')
    .option('--output <path>', 'Save the PNG to a file instead of printing base64 to stdout')
    .action(async (opts: { output?: string }) => {
      const client = await DaemonClient.fromDaemonState();
      const result = await client.takeScreenshot();

      if (opts.output) {
        await writeFile(opts.output, Buffer.from(result.data, 'base64'));
        console.log(`Screenshot saved to ${opts.output} (captured at ${result.capturedAt})`);
      } else {
        console.log(result.data);
      }
    });
}
