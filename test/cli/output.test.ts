import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { makeOutput } from '../../src/cli/output.js';

/**
 * `isTTY` is absent rather than false on a non-tty stdout, so there is no getter
 * to spy on — it has to be set and put back.
 */
function withTty<T>(value: boolean, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process.stdout, 'isTTY', original);
    }
  }
}

function programWith(json: boolean): Command {
  const program = new Command();
  program.option('--json', 'json output', false);
  program.parse(json ? ['node', 'cli', '--json'] : ['node', 'cli']);
  return program;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('makeOutput', () => {
  it('runs the human renderer by default', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const human = vi.fn(() => console.log('Clicked.'));

    makeOutput(programWith(false)).emit({ clicked: true }, human);

    expect(human).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Clicked.');
  });

  it('prints JSON and skips the human renderer under --json', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const human = vi.fn();

    makeOutput(programWith(true)).emit({ clicked: true }, human);

    expect(human).not.toHaveBeenCalled();
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ clicked: true });
  });

  it('indents JSON when a human is watching a terminal', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    withTty(true, () => makeOutput(programWith(true)).emit({ clicked: true }, vi.fn()));

    expect(log.mock.calls[0]![0]).toBe('{\n  "clicked": true\n}');
  });

  it('drops the indentation when stdout is piped', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    withTty(false, () => makeOutput(programWith(true)).emit({ clicked: true }, vi.fn()));

    expect(log.mock.calls[0]![0]).toBe('{"clicked":true}');
  });

  it('reports which mode is active', () => {
    expect(makeOutput(programWith(true)).isJson()).toBe(true);
    expect(makeOutput(programWith(false)).isJson()).toBe(false);
  });
});
