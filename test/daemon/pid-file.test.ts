import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isDaemonProcessAlive, readDaemonState, removeDaemonState, writeDaemonState } from '../../src/daemon/pid-file.js';
import type { DaemonState } from '../../src/shared/types.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

const state: DaemonState = { pid: 1234, port: 47321, startedAt: '2026-01-01T00:00:00.000Z' };

describe('writeDaemonState', () => {
  it('creates the config dir and writes JSON', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await writeDaemonState(state);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.appium-agent'), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('daemon.json'),
      JSON.stringify(state, null, 2),
      'utf8',
    );
  });
});

describe('readDaemonState', () => {
  it('returns parsed state on success', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(state) as never);
    const result = await readDaemonState();
    expect(result).toEqual(state);
  });

  it('returns null when file does not exist', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT') as never);
    const result = await readDaemonState();
    expect(result).toBeNull();
  });

  it('returns null when file contains invalid JSON', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValueOnce('not-json' as never);
    const result = await readDaemonState();
    expect(result).toBeNull();
  });
});

describe('removeDaemonState', () => {
  it('calls unlink on the state file', async () => {
    const { unlink } = await import('node:fs/promises');
    await removeDaemonState();
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('daemon.json'));
  });

  it('silently ignores errors', async () => {
    const { unlink } = await import('node:fs/promises');
    vi.mocked(unlink).mockRejectedValueOnce(new Error('ENOENT') as never);
    await expect(removeDaemonState()).resolves.toBeUndefined();
  });
});

describe('isDaemonProcessAlive', () => {
  it('returns true for the current process', () => {
    expect(isDaemonProcessAlive(process.pid)).toBe(true);
  });

  it('returns false when process.kill throws', () => {
    const killSpy = vi.spyOn(process, 'kill').mockImplementationOnce(() => {
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    });
    expect(isDaemonProcessAlive(99999999)).toBe(false);
    killSpy.mockRestore();
  });
});
