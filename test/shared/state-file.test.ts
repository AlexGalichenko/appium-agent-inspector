import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDaemonProcessAlive,
  readDaemonState,
  removeDaemonState,
  writeDaemonState,
} from '../../src/shared/state-file.js';
import type { DaemonState } from '../../src/shared/types.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

const state: DaemonState = {
  pid: 1234,
  port: 47321,
  startedAt: '2026-01-01T00:00:00.000Z',
};

describe('writeDaemonState', () => {
  it('creates the config dir and writes JSON', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await writeDaemonState(state);
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.appium-agent'), {
      recursive: true,
    });
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

describe('isDaemonHealthy', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when /health identifies our service', async () => {
    const { isDaemonHealthy } = await import('../../src/shared/state-file.js');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, data: { status: 'ok', service: 'appium-agent' } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );
    await expect(isDaemonHealthy(state)).resolves.toBe(true);
  });

  it('sends the daemon token so an authenticated daemon answers', async () => {
    const { isDaemonHealthy } = await import('../../src/shared/state-file.js');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { service: 'appium-agent' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await isDaemonHealthy({ ...state, token: 'secret-token' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-appium-agent-token']).toBe(
      'secret-token',
    );
  });

  it('returns false when another service occupies the port', async () => {
    const { isDaemonHealthy } = await import('../../src/shared/state-file.js');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { status: 'ok' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(isDaemonHealthy(state)).resolves.toBe(false);
  });

  it('returns false when nothing is listening', async () => {
    const { isDaemonHealthy } = await import('../../src/shared/state-file.js');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(isDaemonHealthy(state)).resolves.toBe(false);
  });

  it('returns false on a non-2xx response', async () => {
    const { isDaemonHealthy } = await import('../../src/shared/state-file.js');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 503 })),
    );
    await expect(isDaemonHealthy(state)).resolves.toBe(false);
  });
});

describe('findRunningDaemon', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null and clears the state file when the process is gone', async () => {
    const { findRunningDaemon } = await import('../../src/shared/state-file.js');
    const { readFile, unlink } = await import('node:fs/promises');
    // Dead PID, and nothing answers: safe to clear.
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ ...state, pid: 999999 }) as never,
    );
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(findRunningDaemon()).resolves.toBeNull();
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('daemon.json'));
  });

  it('keeps the state file when the process is alive but the probe failed', async () => {
    const { findRunningDaemon } = await import('../../src/shared/state-file.js');
    const { readFile, unlink } = await import('node:fs/promises');
    // A live daemon that missed one probe must not be orphaned.
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ ...state, pid: process.pid }) as never,
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));

    await expect(findRunningDaemon()).resolves.toBeNull();
    expect(unlink).not.toHaveBeenCalled();
  });

  it('does not trust a stale PID that a different process now owns', async () => {
    const { findRunningDaemon } = await import('../../src/shared/state-file.js');
    const { readFile } = await import('node:fs/promises');
    // The PID is alive (it is our own), but nothing answers /health.
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ ...state, pid: process.pid }) as never,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(findRunningDaemon()).resolves.toBeNull();
  });

  it('returns the state when the daemon answers', async () => {
    const { findRunningDaemon } = await import('../../src/shared/state-file.js');
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(state) as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { service: 'appium-agent' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(findRunningDaemon()).resolves.toEqual(state);
  });

  it('returns null when there is no state file at all', async () => {
    const { findRunningDaemon } = await import('../../src/shared/state-file.js');
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT') as never);
    await expect(findRunningDaemon()).resolves.toBeNull();
  });
});

describe('removeDaemonStateIfOwnedBy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the file when the pid matches', async () => {
    const { removeDaemonStateIfOwnedBy } = await import('../../src/shared/state-file.js');
    const { readFile, unlink } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(state) as never);

    await expect(removeDaemonStateIfOwnedBy(state.pid)).resolves.toBe(true);
    expect(unlink).toHaveBeenCalled();
  });

  it('leaves a newer daemon record alone', async () => {
    const { removeDaemonStateIfOwnedBy } = await import('../../src/shared/state-file.js');
    const { readFile, unlink } = await import('node:fs/promises');
    // A replacement daemon claimed the file while this one was shutting down.
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({ ...state, pid: 4321 }) as never,
    );

    await expect(removeDaemonStateIfOwnedBy(state.pid)).resolves.toBe(false);
    expect(unlink).not.toHaveBeenCalled();
  });

  it('reports false when there is no state file', async () => {
    const { removeDaemonStateIfOwnedBy } = await import('../../src/shared/state-file.js');
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT') as never);

    await expect(removeDaemonStateIfOwnedBy(state.pid)).resolves.toBe(false);
  });
});
