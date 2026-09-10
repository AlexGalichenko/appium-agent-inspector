import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerVideoStart(program: Command): void {
  const out = makeOutput(program);

  program
    .command('video-start')
    .description('Start recording the device screen')
    .action(async () => {
      const client = await DaemonClient.fromDaemonState();
      await client.startVideoRecording();
      out.emit({ recording: true }, () => console.log('Recording started.'));
    });
}
