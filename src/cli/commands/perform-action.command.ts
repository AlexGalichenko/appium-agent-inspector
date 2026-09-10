import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { makeOutput } from '../output.js';
import { ValidationError } from '../../shared/errors.js';

export function registerPerformAction(program: Command): void {
  const out = makeOutput(program);

  program
    .command('perform-action')
    .description(
      'Perform a touch gesture or raw W3C actions sequence.\n' +
        '  High-level gestures (JSON object):\n' +
        '    {"type":"tap","x":200,"y":400}\n' +
        '    {"type":"swipe","startX":100,"startY":700,"endX":100,"endY":200,"duration":500}\n' +
        '    {"type":"long-press","x":200,"y":400,"duration":1500}\n' +
        '  Raw W3C actions (JSON array):\n' +
        '    [{"type":"pointer","id":"f1","parameters":{"pointerType":"touch"},"actions":[...]}]',
    )
    .argument('<json>', 'JSON gesture object or W3C actions array')
    .action(async (json: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new ValidationError('The <json> argument is not valid JSON.');
      }

      const client = await DaemonClient.fromDaemonState();
      const result = await client.performAction(parsed);
      out.emit(result, () => console.log(result.message));
    });
}
