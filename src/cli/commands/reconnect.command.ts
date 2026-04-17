import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import type { AppiumServerConfig } from '../../shared/types.js';
import { AppiumCapabilitiesSchema, AppiumServerConfigSchema } from '../../shared/types.js';

export function registerReconnect(program: Command): void {
  program
    .command('reconnect')
    .description('Close any active session and start a new one (recovers from dropped sessions)')
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

      // Close existing session if any — ignore errors (session may already be gone)
      try {
        await client.endSession();
      } catch {
        // Swallow SESSION_NOT_ACTIVE and any stale-session errors
      }

      const result = await client.startSession({ capabilities: caps, server });

      console.log(`Session started: ${result.sessionId}`);
      console.log(`Started at:      ${result.startedAt}`);
    });
}

function parseCaps(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error(
      `Could not parse capabilities as JSON: ${input}\nProvide a valid JSON string.`,
    );
  }
}
