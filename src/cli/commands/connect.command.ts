import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { ValidationError } from '../../shared/errors.js';
import type { AppiumServerConfig } from '../../shared/types.js';
import {
  AppiumCapabilitiesSchema,
  AppiumServerConfigSchema,
} from '../../shared/types.js';

export function registerConnect(program: Command): void {
  const out = makeOutput(program);

  program
    .command('connect')
    .description('Start an app by creating an Appium session')
    .requiredOption(
      '--caps <json>',
      'Appium capabilities: a JSON string or a path to a JSON file',
    )
    .option('--server-host <host>', 'Appium server hostname', 'localhost')
    .option('--server-port <port>', 'Appium server port', '4723')
    .option('--server-path <path>', 'Appium server base path', '/')
    .action(
      async (opts: {
        caps: string;
        serverHost: string;
        serverPort: string;
        serverPath: string;
      }) => {
        const parsed = AppiumCapabilitiesSchema.safeParse(parseCaps(opts.caps));
        if (!parsed.success) {
          throw new ValidationError(
            `Invalid capabilities: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
          );
        }

        const port = Number(opts.serverPort);
        if (!Number.isInteger(port) || port <= 0) {
          throw new ValidationError(
            `--server-port must be a positive integer, got "${opts.serverPort}".`,
          );
        }

        const serverPartial: Partial<AppiumServerConfig> = {
          hostname: opts.serverHost,
          port,
          path: opts.serverPath,
        };
        const server = AppiumServerConfigSchema.partial().parse(serverPartial);

        const client = await DaemonClient.fromDaemonState();
        const result = await client.startSession({ capabilities: parsed.data, server });

        out.emit(result, () => {
          console.log(`Session started: ${result.sessionId}`);
          console.log(`Started at: ${result.startedAt}`);
        });
      },
    );
}

/** Accepts an inline JSON object or a path to a `.json` file holding one. */
export function parseCaps(input: string): unknown {
  const trimmed = input.trim();

  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new ValidationError(
        `--caps is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const path = resolve(trimmed);
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    throw new ValidationError(
      `--caps must be a JSON object or a readable JSON file. Could not read: ${path}`,
    );
  }

  try {
    return JSON.parse(contents);
  } catch (err) {
    throw new ValidationError(
      `Capabilities file ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
