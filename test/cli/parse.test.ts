import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/shared/errors.js';
import { parseChoice, parseInteger, parseStrategy } from '../../src/cli/parse.js';

describe('parseChoice', () => {
  const directions = ['up', 'down'] as const;

  it('returns a valid value', () => {
    expect(parseChoice(directions, 'down', 'direction', 'directions')).toBe('down');
  });

  it('names every valid value when given an unknown one', () => {
    expect(() => parseChoice(directions, 'sideways', 'direction', 'directions')).toThrow(
      'Unknown direction "sideways". Valid directions: up, down',
    );
  });
});

describe('parseStrategy', () => {
  it('accepts a locator strategy', () => {
    expect(parseStrategy('-ios class chain')).toBe('-ios class chain');
  });

  it('rejects an unknown strategy with a validation error', () => {
    expect(() => parseStrategy('magic')).toThrow(ValidationError);
    expect(() => parseStrategy('magic')).toThrow(/accessibility id/);
  });
});

describe('parseInteger', () => {
  it('parses an integer within bounds', () => {
    expect(parseInteger('42', '--n', { min: 1, max: 50 })).toBe(42);
  });

  it.each(['1.5', 'abc', '-1'])('rejects %o as non-negative integer', (raw) => {
    expect(() => parseInteger(raw, '--index')).toThrow(
      `--index must be a non-negative integer, got "${raw}".`,
    );
  });

  it('reports an empty value rather than reading it as 0', () => {
    expect(() => parseInteger('  ', '--index')).toThrow('but was empty');
  });

  it('describes a positive-only flag', () => {
    expect(() => parseInteger('0', '--timeout', { min: 1 })).toThrow(
      '--timeout must be a positive integer, got "0".',
    );
  });

  it('enforces an upper bound and names the range', () => {
    expect(() => parseInteger('70000', '--port', { min: 1, max: 65535 })).toThrow(
      '--port must be an integer between 1 and 65535, got "70000".',
    );
  });
});
