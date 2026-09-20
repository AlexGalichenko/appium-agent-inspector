import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { registerStartDaemon } from '../../../src/cli/commands/start-daemon.command.js';
import { registerKillDaemon } from '../../../src/cli/commands/kill-daemon.command.js';
import { runCommand, runJson } from './helpers.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', () => ({ openSync: vi.fn(() => 7), closeSync: vi.fn() }));

vi.mock('../../../src/shared/state-file.js', () => ({
  ensureConfigDir: vi.fn(),
  findRunningDaemon: vi.fn(),
  readDaemonState: vi.fn(),
  isDaemonProcessAlive: vi.fn(),
  removeDaemonStateIfOwnedBy: vi.fn(),
}));

vi.mock('../../../src/shared/start-lock.js', () => ({ acquireStartLock: vi.fn() }));

vi.mock('../../../src/cli/daemon-client.js', () => ({
  DaemonClient: { default: vi.fn(), fromDaemonState: vi.fn() },
}));

import { spawn } from 'node:child_process';
import { DaemonClient } from '../../../src/cli/daemon-client.js';
import {
  ensureConfigDir,
  findRunningDaemon,
  isDaemonProcessAlive,
  readDaemonState,
  removeDaemonStateIfOwnedBy,
} from '../../../src/shared/state-file.js';
import { acquireStartLock } from '../../../src/shared/start-lock.js';

const STATE = {
  pid: 4242,
  port: 47321,
  startedAt: '2026-01-01T00:00:00.000Z',
  token: 'tok',
};

/** A spawned-daemon stand-in whose `exit` event the tests drive by hand. */
function fakeChild(pid = STATE.pid) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    unref: () => void;
  };
  child.pid = pid;
  child.unref = vi.fn();
  return child;
}

/**
 * Makes `spawn` return a child that dies as soon as the command starts polling.
 * Queuing the emit inside the mock ties it to the spawn call, so the startup
 * loop always observes the exit on its first pass.
 */
function spawnDiesWith(code: number | null, signal: string | null) {
  vi.mocked(spawn).mockImplementation((() => {
    const child = fakeChild();
    queueMicrotask(() => child.emit('exit', code, signal));
    return child;
  }) as never);
}

/** Makes the daemon's health check answer `healthy`. */
function healthCheckReturns(healthy: boolean) {
  vi.mocked(DaemonClient.default).mockReturnValue({
    healthCheck: vi.fn().mockResolvedValue(healthy),
  } as never);
}

const release = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();

  // Both commands poll with `await new Promise(r => setTimeout(r, ms))` against
  // a Date.now() deadline. Firing the callback at once without moving the clock
  // would spin that loop forever, so the fake timer advances a fake clock by
  // exactly the delay it was asked to wait.
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms = 0) => {
    now += ms;
    fn();
    return 0 as unknown as NodeJS.Timeout;
  }) as never);

  vi.mocked(acquireStartLock).mockResolvedValue(release);
  vi.mocked(ensureConfigDir).mockResolvedValue('/tmp/cfg');
  vi.mocked(findRunningDaemon).mockResolvedValue(null);
  vi.mocked(readDaemonState).mockResolvedValue(STATE);
  vi.mocked(removeDaemonStateIfOwnedBy).mockResolvedValue(true);
  vi.mocked(spawn).mockReturnValue(fakeChild() as never);
  healthCheckReturns(true);
});

afterEach(() => vi.restoreAllMocks());

describe('daemon:start', () => {
  it('does not spawn a second daemon when one is already healthy', async () => {
    vi.mocked(findRunningDaemon).mockResolvedValue(STATE);

    const lines = await runCommand(registerStartDaemon, ['daemon:start']);

    expect(spawn).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/already running \(pid: 4242, port: 47321\)/);
  });

  it('flags the already-running case under --json', async () => {
    vi.mocked(findRunningDaemon).mockResolvedValue(STATE);
    const result = await runJson(registerStartDaemon, ['daemon:start']);
    expect(result).toMatchObject({ started: false, alreadyRunning: true, pid: 4242 });
  });

  it('holds the start lock across the whole attempt', async () => {
    await runCommand(registerStartDaemon, ['daemon:start']);
    expect(acquireStartLock).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases the start lock even when startup fails', async () => {
    spawnDiesWith(1, null);

    await runCommand(registerStartDaemon, ['daemon:start']).catch(() => undefined);

    expect(release).toHaveBeenCalledOnce();
  });

  it('detaches the daemon and redirects its output to the log file', async () => {
    await runCommand(registerStartDaemon, ['daemon:start']);

    const [, , options] = vi.mocked(spawn).mock.calls[0] as [
      string,
      string[],
      { detached: boolean; stdio: unknown[] },
    ];
    expect(options.detached).toBe(true);
    expect(options.stdio).toEqual(['ignore', 7, 7]);
  });

  it('runs attached with inherited stdio under --foreground', async () => {
    await runCommand(registerStartDaemon, ['daemon:start', '--foreground']);

    const [, , options] = vi.mocked(spawn).mock.calls[0] as [
      string,
      string[],
      { detached?: boolean; stdio: unknown },
    ];
    expect(options.detached).toBeUndefined();
    expect(options.stdio).toBe('inherit');
  });

  it('forwards an explicit --port to the daemon process', async () => {
    await runCommand(registerStartDaemon, ['daemon:start', '--port', '5000']);
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[], unknown];
    expect(args.slice(-2)).toEqual(['--port', '5000']);
  });

  it('passes no port argument when none is given', async () => {
    await runCommand(registerStartDaemon, ['daemon:start']);
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[], unknown];
    expect(args).toHaveLength(1);
  });

  it('rejects an out-of-range --port without spawning anything', async () => {
    await expect(
      runCommand(registerStartDaemon, ['daemon:start', '--port', '70000']),
    ).rejects.toThrow(/--port/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('reports the pid and port once the daemon answers', async () => {
    const lines = await runCommand(registerStartDaemon, ['daemon:start']);
    expect(lines.join('\n')).toMatch(/Daemon started \(pid: 4242, port: 47321\)/);
  });

  it('fails fast when the daemon exits during startup', async () => {
    spawnDiesWith(1, null);

    await expect(runCommand(registerStartDaemon, ['daemon:start'])).rejects.toThrow(
      /exited during startup \(exit code 1\)/,
    );
  });

  it('names the signal when the daemon is killed during startup', async () => {
    spawnDiesWith(null, 'SIGKILL');

    await expect(runCommand(registerStartDaemon, ['daemon:start'])).rejects.toThrow(
      /signal SIGKILL/,
    );
  });

  it('gives up when the daemon never becomes healthy', async () => {
    healthCheckReturns(false);
    await expect(runCommand(registerStartDaemon, ['daemon:start'])).rejects.toThrow(
      /did not become healthy/,
    );
  });

  it('ignores a state file left by a different daemon', async () => {
    // A stale record from an earlier daemon must not be mistaken for the one
    // just spawned, or the CLI reports success for a process that never came up.
    vi.mocked(readDaemonState).mockResolvedValue({ ...STATE, pid: 999 });

    await expect(runCommand(registerStartDaemon, ['daemon:start'])).rejects.toThrow(
      /did not become healthy/,
    );
  });

  it('tolerates a missing state file while polling', async () => {
    vi.mocked(readDaemonState).mockResolvedValue(null);
    await expect(runCommand(registerStartDaemon, ['daemon:start'])).rejects.toThrow(
      /did not become healthy/,
    );
  });
});

describe('daemon:kill', () => {
  it('reports nothing to do when no state file exists', async () => {
    vi.mocked(readDaemonState).mockResolvedValue(null);
    const lines = await runCommand(registerKillDaemon, ['daemon:kill']);
    expect(lines).toEqual(['Daemon is not running.']);
  });

  it('clears a state file whose process is already gone', async () => {
    vi.mocked(isDaemonProcessAlive).mockReturnValue(false);
    const lines = await runCommand(registerKillDaemon, ['daemon:kill']);

    expect(removeDaemonStateIfOwnedBy).toHaveBeenCalledWith(STATE.pid);
    expect(lines).toEqual(['Daemon is not running.']);
  });

  it('sends SIGTERM and confirms the daemon stopped', async () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    vi.mocked(isDaemonProcessAlive).mockReturnValueOnce(true).mockReturnValue(false);

    const lines = await runCommand(registerKillDaemon, ['daemon:kill']);

    expect(kill).toHaveBeenCalledWith(STATE.pid, 'SIGTERM');
    expect(lines).toEqual(['Daemon stopped (pid: 4242).']);
  });

  it('removes the state file only after the daemon has exited', async () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    vi.mocked(isDaemonProcessAlive).mockReturnValueOnce(true).mockReturnValue(false);

    await runCommand(registerKillDaemon, ['daemon:kill']);

    expect(removeDaemonStateIfOwnedBy).toHaveBeenCalledWith(STATE.pid);
  });

  it('reports the killed pid under --json', async () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    vi.mocked(isDaemonProcessAlive).mockReturnValueOnce(true).mockReturnValue(false);

    expect(await runJson(registerKillDaemon, ['daemon:kill'])).toEqual({
      killed: true,
      pid: STATE.pid,
    });
  });

  it('exits non-zero when the daemon refuses to die', async () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    vi.mocked(isDaemonProcessAlive).mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });

    await expect(runCommand(registerKillDaemon, ['daemon:kill'])).rejects.toThrow(
      'exit 1',
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/did not exit/));
  });
});
