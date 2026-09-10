import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { makeOutput } from '../../src/cli/output.js';

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

  it('reports which mode is active', () => {
    expect(makeOutput(programWith(true)).isJson()).toBe(true);
    expect(makeOutput(programWith(false)).isJson()).toBe(false);
  });
});
