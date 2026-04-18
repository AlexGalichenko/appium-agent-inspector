import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import type { AppiumServerConfig } from '../../shared/types.js';
import { AppiumCapabilitiesSchema, AppiumServerConfigSchema } from '../../shared/types.js';

export function registerConnect(program: Command): void {
  program
    .command('connect')
    .description('Start an app by creating an Appium session')
    .requiredOption('--caps <json>', 'Appium capabilities as a JSON string or path to a JSON file')
    .option('--server-host <host>', 'Appium server hostname', 'localhost')
    .option('--server-port <port>', 'Appium server port', '4723')
    .option('--server-path <path>', 'Appium server base path', '/')
    .action(async (opts: {
      caps: string;
      serverHost: string;
      serverPort: string;
      serverPath: string;
    }) => {
      const rawCaps = parseCaps(opts.caps);
      const caps = AppiumCapabilitiesSchema.parse(rawCaps);

      const serverPartial: Partial<AppiumServerConfig> = {
        hostname: opts.serverHost,
        port: Number(opts.serverPort),
        path: opts.serverPath,
      };
      const server = AppiumServerConfigSchema.partial().parse(serverPartial);

      const client = await DaemonClient.fromDaemonState();
      const result = await client.startSession({ capabilities: caps, server });

      console.log(`Session started: ${result.sessionId}`);
      console.log(`Started at: ${result.startedAt}`);
    });
}

function parseCaps(input: string): unknown {
  // Try parsing as JSON directly
  try {
    return JSON.parse(input);
  } catch {
    // Could be a file path — let the caller handle the error
    throw new Error(
      `Could not parse capabilities as JSON: ${input}\nProvide a valid JSON string.`,
    );
  }
}
