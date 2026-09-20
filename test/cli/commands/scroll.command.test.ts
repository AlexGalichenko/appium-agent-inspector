import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerScroll } from '../../../src/cli/commands/scroll.command.js';
import { firstArg, resolves, runCommand, useClient } from './helpers.js';

vi.mock('../../../src/cli/daemon-client.js', () => ({
  DaemonClient: { fromDaemonState: vi.fn() },
}));

afterEach(() => vi.restoreAllMocks());

const TO_ELEMENT = ['--to-strategy', 'accessibility id', '--to-selector', 'Submit'];

describe('scroll', () => {
  let scroll: ReturnType<typeof resolves>;

  beforeEach(() => {
    scroll = resolves({ direction: 'down', swipes: 1, found: null });
    useClient({ scroll });
  });

  it('defaults to one downward swipe over 60% of the screen', async () => {
    await runCommand(registerScroll, ['scroll']);
    expect(firstArg(scroll)).toEqual({
      direction: 'down',
      percent: 0.6,
      maxSwipes: 10,
      duration: 600,
    });
  });

  it('passes an explicit direction through', async () => {
    await runCommand(registerScroll, ['scroll', '--direction', 'left']);
    expect(firstArg(scroll).direction).toBe('left');
  });

  it('rejects an unknown direction and names the valid ones', async () => {
    await expect(
      runCommand(registerScroll, ['scroll', '--direction', 'diagonal']),
    ).rejects.toThrow(/Unknown direction.*up, down, left, right/s);
  });

  it('parses --percent as a fraction', async () => {
    await runCommand(registerScroll, ['scroll', '--percent', '0.25']);
    expect(firstArg(scroll).percent).toBe(0.25);
  });

  it.each([
    ['above the cap', '0.96'],
    ['zero', '0'],
    ['negative', '-0.5'],
    ['not a number', 'half'],
  ])('rejects a --percent that is %s', async (_label, value) => {
    await expect(
      runCommand(registerScroll, ['scroll', '--percent', value]),
    ).rejects.toThrow(/--percent must be between 0 and 0\.95/);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('accepts the boundary value 0.95', async () => {
    await runCommand(registerScroll, ['scroll', '--percent', '0.95']);
    expect(firstArg(scroll).percent).toBe(0.95);
  });

  it('adds a toElement when both --to-* flags are given', async () => {
    await runCommand(registerScroll, ['scroll', ...TO_ELEMENT]);
    expect(firstArg(scroll).toElement).toEqual({
      strategy: 'accessibility id',
      selector: 'Submit',
    });
  });

  it('omits toElement for a plain scroll', async () => {
    await runCommand(registerScroll, ['scroll']);
    expect(firstArg(scroll).toElement).toBeUndefined();
  });

  it.each([
    ['--to-strategy', ['--to-strategy', 'id']],
    ['--to-selector', ['--to-selector', 'Submit']],
  ])('rejects %s without its partner', async (_label, argv) => {
    await expect(runCommand(registerScroll, ['scroll', ...argv])).rejects.toThrow(
      /needs both --to-strategy and --to-selector/,
    );
    expect(scroll).not.toHaveBeenCalled();
  });

  it('rejects --max-swipes beyond the daemon bound before requesting', async () => {
    await expect(
      runCommand(registerScroll, ['scroll', '--max-swipes', '51']),
    ).rejects.toThrow(/--max-swipes/);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('rejects a zero --max-swipes', async () => {
    await expect(
      runCommand(registerScroll, ['scroll', '--max-swipes', '0']),
    ).rejects.toThrow(/--max-swipes/);
  });

  describe('reporting', () => {
    it('reports a plain scroll without mentioning a search', async () => {
      const lines = await runCommand(registerScroll, ['scroll']);
      expect(lines).toEqual(['Scrolled down.']);
    });

    it('reports how many swipes it took to reveal the element', async () => {
      useClient({ scroll: resolves({ direction: 'down', swipes: 3, found: true }) });
      const lines = await runCommand(registerScroll, ['scroll', ...TO_ELEMENT]);
      expect(lines).toEqual(['Element in view after 3 swipe(s).']);
    });

    it('reports giving up, including the direction it tried', async () => {
      useClient({ scroll: resolves({ direction: 'up', swipes: 10, found: false }) });
      const lines = await runCommand(registerScroll, ['scroll', ...TO_ELEMENT]);
      expect(lines).toEqual(['Element not found after 10 swipe(s) scrolling up.']);
    });
  });
});
