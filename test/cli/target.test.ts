import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { ValidationError } from '../../src/shared/errors.js';
import { addTargetOptions, parseIndex, resolveTarget } from '../../src/cli/target.js';

describe('addTargetOptions', () => {
  it('registers the shared target flags on a command', () => {
    const cmd = addTargetOptions(new Command('click'));
    const flags = cmd.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining(['--element-id', '--strategy', '--selector', '--index']),
    );
  });

  it('returns the same command so it can be chained', () => {
    const cmd = new Command('click');
    expect(addTargetOptions(cmd)).toBe(cmd);
  });
});

describe('resolveTarget', () => {
  it('prefers a stored element reference', () => {
    expect(resolveTarget({ elementId: 'ref-1' })).toEqual({ elementId: 'ref-1' });
  });

  it('ignores a locator when an element ID is given', () => {
    const target = resolveTarget({
      elementId: 'ref-1',
      strategy: 'accessibility id',
      selector: 'Login',
    });
    expect(target).toEqual({ elementId: 'ref-1' });
  });

  it('builds a locator target from strategy and selector', () => {
    expect(resolveTarget({ strategy: 'accessibility id', selector: 'Login' })).toEqual({
      strategy: 'accessibility id',
      selector: 'Login',
      index: 0,
    });
  });

  it('carries an explicit index through', () => {
    expect(
      resolveTarget({ strategy: 'class name', selector: 'Cell', index: '3' }),
    ).toMatchObject({ index: 3 });
  });

  it('explains what is missing when neither form is complete', () => {
    expect(() => resolveTarget({ strategy: 'accessibility id' })).toThrow(
      ValidationError,
    );
    expect(() => resolveTarget({})).toThrow(/--element-id/);
  });

  it('names the valid strategies when given an unknown one', () => {
    expect(() => resolveTarget({ strategy: 'magic', selector: 'x' })).toThrow(
      /accessibility id/,
    );
  });
});

describe('parseIndex', () => {
  it('defaults to 0', () => {
    expect(parseIndex(undefined)).toBe(0);
  });

  it('parses a numeric string', () => {
    expect(parseIndex('7')).toBe(7);
  });

  it.each(['-1', '1.5', 'abc', ''])('rejects %o', (raw) => {
    expect(() => parseIndex(raw)).toThrow(ValidationError);
  });
});
