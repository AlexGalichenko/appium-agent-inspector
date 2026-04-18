import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerVideoStart(program: Command): void {
  program
    .command('video-start')
    .description('Start video recording of the device screen')
    .action(async () => {
      const client = await DaemonClient.fromDaemonState();
      await client.startVideoRecording();
      console.log('Recording started.');
    });
}
