import { writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerVideoStop(program: Command): void {
  program
    .command('video-stop')
    .description('Stop video recording and save to file')
    .argument('[output]', 'Output file path (e.g. /tmp/recording.mp4)')
    .action(async (output?: string) => {
      const client = await DaemonClient.fromDaemonState();
      const result = await client.stopVideoRecording();

      if (output) {
        await writeFile(output, Buffer.from(result.data, 'base64'));
        console.log(`Recording saved to ${output}`);
      } else {
        console.log(result.data);
      }
    });
}
