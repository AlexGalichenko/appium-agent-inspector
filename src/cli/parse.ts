import { ValidationError } from '../shared/errors.js';
import { LocatorStrategySchema } from '../shared/types.js';
import type { LocatorStrategy } from '../shared/types.js';

/** Validates a flag against a fixed set of values, naming every valid one on failure. */
export function parseChoice<T extends string>(
  options: readonly T[],
  raw: string,
  noun: string,
  plural: string,
): T {
  const match = options.find((option) => option === raw);
  if (match === undefined) {
    throw new ValidationError(
      `Unknown ${noun} "${raw}". Valid ${plural}: ${options.join(', ')}`,
    );
  }
  return match;
}

export function parseStrategy(raw: string): LocatorStrategy {
  return parseChoice(
    LocatorStrategySchema.options,
    raw,
    'locator strategy',
    'strategies',
  );
}

export function parseInteger(
  raw: string,
  flag: string,
  { min = 0, max }: { min?: number; max?: number } = {},
): number {
  const expected =
    max !== undefined
      ? `an integer between ${min} and ${max}`
      : min === 0
        ? 'a non-negative integer'
        : min === 1
          ? 'a positive integer'
          : `an integer of at least ${min}`;

  // Number('') and Number('  ') are both 0, which would silently accept an
  // empty value instead of reporting it.
  if (raw.trim() === '') {
    throw new ValidationError(`${flag} must be ${expected}, but was empty.`);
  }

  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || (max !== undefined && n > max)) {
    throw new ValidationError(`${flag} must be ${expected}, got "${raw}".`);
  }
  return n;
}
