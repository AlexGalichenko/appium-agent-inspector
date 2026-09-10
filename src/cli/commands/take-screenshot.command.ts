import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerTakeScreenshot(program: Command): void {
  const out = makeOutput(program);

  program
    .command('take-screenshot')
    .description('Capture a screenshot of the current device screen')
    .option('--output <path>', 'Where to save the PNG (default: a temp file)')
    .option('--base64', 'Print raw base64 to stdout instead of saving a file', false)
    .action(async (opts: { output?: string; base64: boolean }) => {
      const client = await DaemonClient.fromDaemonState();
      const result = await client.takeScreenshot();

      // Base64 PNGs run to megabytes. Printing one by default floods an
      // agent's context, so saving and reporting the path is the default.
      if (opts.base64) {
        out.emit({ data: result.data, capturedAt: result.capturedAt }, () =>
          console.log(result.data),
        );
        return;
      }

      const path = opts.output ?? join(tmpdir(), `appium-screenshot-${Date.now()}.png`);
      await writeFile(path, Buffer.from(result.data, 'base64'));

      out.emit({ path, capturedAt: result.capturedAt }, () =>
        console.log(`Screenshot saved to ${path} (captured at ${result.capturedAt})`),
      );
    });
}
