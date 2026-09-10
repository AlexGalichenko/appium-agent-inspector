import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';

export function registerContext(program: Command): void {
  const out = makeOutput(program);

  program
    .command('context')
    .description('List native/webview contexts, or switch to one with --switch')
    .option('--switch <name>', 'Switch to this context (e.g. WEBVIEW_1, NATIVE_APP)')
    .action(async (opts: { switch?: string }) => {
      const client = await DaemonClient.fromDaemonState();

      const result =
        opts.switch === undefined
          ? await client.getContexts()
          : await client.switchContext(opts.switch);

      out.emit(result, () => {
        for (const name of result.contexts) {
          console.log(`${name === result.current ? '*' : ' '} ${name}`);
        }
      });
    });
}
