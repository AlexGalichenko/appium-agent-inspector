import type { Command } from 'commander';
import { ValidationError } from '../shared/errors.js';
import { LocatorStrategySchema } from '../shared/types.js';
import type { ElementTarget } from '../shared/types.js';

/**
 * Every element-facing command accepts the same target: either a stored
 * reference from `find-element`, or a strategy + selector pair.
 */
export function addTargetOptions(cmd: Command): Command {
  return cmd
    .option('--element-id <id>', 'Stored element reference ID from find-element')
    .option('--strategy <strategy>', 'Locator strategy (when not using --element-id)')
    .option('--selector <selector>', 'Element selector (when not using --element-id)')
    .option('--index <n>', 'Which match to use when the selector is ambiguous', '0');
}

export interface TargetOptions {
  elementId?: string;
  strategy?: string;
  selector?: string;
  index?: string;
}

export function resolveTarget(opts: TargetOptions): ElementTarget {
  if (opts.elementId !== undefined) {
    return { elementId: opts.elementId };
  }

  if (opts.strategy === undefined || opts.selector === undefined) {
    throw new ValidationError(
      'Provide either --element-id, or both --strategy and --selector.',
    );
  }

  const parsed = LocatorStrategySchema.safeParse(opts.strategy);
  if (!parsed.success) {
    throw new ValidationError(
      `Unknown locator strategy "${opts.strategy}". Valid strategies: ${LocatorStrategySchema.options.join(', ')}`,
    );
  }

  return {
    strategy: parsed.data,
    selector: opts.selector,
    index: parseIndex(opts.index),
  };
}

export function parseIndex(raw: string | undefined): number {
  if (raw === undefined) return 0;
  // Number('') and Number('  ') are both 0, which would silently accept an
  // empty --index instead of reporting it.
  if (raw.trim() === '') {
    throw new ValidationError('--index must be a non-negative integer, but was empty.');
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ValidationError(`--index must be a non-negative integer, got "${raw}".`);
  }
  return n;
}
