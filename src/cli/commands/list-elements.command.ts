import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import type { ElementReference } from '../../shared/types.js';

export function registerListElements(program: Command): void {
  const out = makeOutput(program);

  program
    .command('list-elements')
    .description('List stored element references, or inspect one with --id')
    .option('--id <id>', 'Show a single stored reference instead of all of them')
    .action(async (opts: { id?: string }) => {
      const client = await DaemonClient.fromDaemonState();

      if (opts.id !== undefined) {
        const ref = await client.getElement(opts.id);
        out.emit(ref, () => printRef(ref));
        return;
      }

      const { elements } = await client.listElements();
      out.emit({ count: elements.length, elements }, () => {
        if (elements.length === 0) {
          console.log('No stored element references. Run find-element first.');
          return;
        }
        console.log(`${elements.length} stored reference(s):`);
        for (const ref of elements) {
          console.log(`  ${ref.id}  [${ref.strategy}] "${ref.selector}" #${ref.index}`);
        }
      });
    });
}

function printRef(ref: ElementReference): void {
  console.log(`ID: ${ref.id}`);
  console.log(`Strategy: ${ref.strategy}`);
  console.log(`Selector: ${ref.selector}`);
  console.log(`Index: ${ref.index}`);
  console.log(`Found at: ${ref.foundAt}`);
  console.log(`Session: ${ref.sessionId}`);
  // Only ambiguous selectors carry one, and its presence is what tells the
  // caller the reference is positional and can go stale as a list scrolls.
  if (ref.fingerprint !== undefined) {
    console.log(`Fingerprint: "${ref.fingerprint}"`);
  }
}
