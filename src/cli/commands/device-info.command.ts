import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerDeviceInfo(program: Command): void {
  const out = makeOutput(program);

  program
    .command('device-info')
    .description('Show screen size, orientation, platform and current context')
    .action(async () => {
      const client = await DaemonClient.fromDaemonState();
      const info = await client.getDeviceInfo();

      out.emit(info, () => {
        console.log(
          `Platform: ${info.platformName ?? '?'} ${info.platformVersion ?? ''}`.trim(),
        );
        console.log(`Device: ${info.deviceName ?? '?'}`);
        console.log(`Screen: ${info.window.width}x${info.window.height}`);
        console.log(`Orientation: ${info.orientation ?? '?'}`);
        console.log(`Context: ${info.context ?? '?'}`);
      });
    });
}
