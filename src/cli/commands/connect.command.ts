import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { parseInteger } from '../parse.js';
import { resolveLocalPath } from '../paths.js';
import { ValidationError } from '../../shared/errors.js';
import {
  APPIUM_DEFAULT_HOST,
  APPIUM_DEFAULT_PATH,
  APPIUM_DEFAULT_PORT,
} from '../../shared/constants.js';
import type { AppiumCapabilities } from '../../shared/types.js';
import { AppiumCapabilitiesSchema } from '../../shared/types.js';

export function registerConnect(program: Command): void {
  const out = makeOutput(program);

  program
    .command('connect')
    .description('Start an app by creating an Appium session')
    .requiredOption(
      '--caps <json>',
      'Appium capabilities: a JSON string or a path to a JSON file',
    )
    .option('--server-host <host>', 'Appium server hostname', APPIUM_DEFAULT_HOST)
    .option('--server-port <port>', 'Appium server port', String(APPIUM_DEFAULT_PORT))
    .option('--server-path <path>', 'Appium server base path', APPIUM_DEFAULT_PATH)
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

        const server = {
          hostname: opts.serverHost,
          port: parseInteger(opts.serverPort, '--server-port', { min: 1, max: 65535 }),
          path: opts.serverPath,
        };

        const client = await DaemonClient.fromDaemonState();
        const result = await client.startSession({
          capabilities: resolveAppCapability(parsed.data),
          server,
        });

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

/** A relative `appium:app` would be resolved by the Appium server, not here. */
export function resolveAppCapability(caps: AppiumCapabilities): AppiumCapabilities {
  const app = caps['appium:app'];
  if (app === undefined) return caps;
  return { ...caps, 'appium:app': resolveLocalPath(app) };
}
