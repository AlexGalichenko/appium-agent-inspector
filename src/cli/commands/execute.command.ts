import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { ValidationError } from '../../shared/errors.js';

export function registerExecute(program: Command): void {
  const out = makeOutput(program);

  program
    .command('execute')
    .description('Execute a mobile command (e.g. "mobile: scroll")')
    .requiredOption(
      '--command <command>',
      'Mobile command to execute (e.g. "mobile: scroll")',
    )
    .option(
      '--params <json>',
      'Command parameters as a JSON object string (e.g. \'{"direction":"down"}\')',
    )
    .action(async (opts: { command: string; params?: string }) => {
      const params = parseParams(opts.params);
      const client = await DaemonClient.fromDaemonState();
      const { result } = await client.executeCommand({ command: opts.command, params });

      out.emit({ result }, () =>
        console.log(
          'Result:',
          result === undefined || result === null
            ? String(result)
            : JSON.stringify(result, null, 2),
        ),
      );
    });
}

function parseParams(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('--params is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError(
      '--params must be a JSON object (e.g. \'{"direction":"down"}\').',
    );
  }

  return parsed as Record<string, unknown>;
}
