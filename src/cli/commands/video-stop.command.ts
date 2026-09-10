import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerVideoStop(program: Command): void {
  const out = makeOutput(program);

  program
    .command('video-stop')
    .description('Stop video recording and save it to a file')
    .argument('[output]', 'Output file path (default: a temp file)')
    .option('--base64', 'Print raw base64 to stdout instead of saving a file', false)
    .action(async (output: string | undefined, opts: { base64: boolean }) => {
      const client = await DaemonClient.fromDaemonState();
      const result = await client.stopVideoRecording();

      if (opts.base64) {
        out.emit({ data: result.data, stoppedAt: result.stoppedAt }, () =>
          console.log(result.data),
        );
        return;
      }

      const path = output ?? join(tmpdir(), `appium-recording-${Date.now()}.mp4`);
      await writeFile(path, Buffer.from(result.data, 'base64'));

      out.emit({ path, stoppedAt: result.stoppedAt }, () =>
        console.log(`Recording saved to ${path}`),
      );
    });
}
