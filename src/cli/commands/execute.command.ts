import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';

export function registerExecute(program: Command): void {
  program
    .command('execute')
    .description('Execute a mobile command (e.g. "mobile: scroll")')
    .requiredOption('--command <command>', 'Mobile command to execute (e.g. "mobile: scroll")')
    .option('--params <json>', 'Command parameters as a JSON object string (e.g. \'{"direction":"down"}\')')
    .action(async (opts: { command: string; params?: string }) => {
      const client = await DaemonClient.fromDaemonState();

      let params: Record<string, unknown> | undefined;
      if (opts.params !== undefined) {
        try {
          const parsed = JSON.parse(opts.params);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            console.error('Error: --params must be a JSON object (e.g. \'{"direction":"down"}\')');
            process.exit(1);
          }
          params = parsed as Record<string, unknown>;
        } catch {
          console.error('Error: --params is not valid JSON');
          process.exit(1);
        }
      }

      const { result } = await client.executeCommand({ command: opts.command, params });
      console.log('Result:', result === undefined || result === null ? String(result) : JSON.stringify(result, null, 2));
    });
}
