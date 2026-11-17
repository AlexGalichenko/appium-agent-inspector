import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppiumAgentError, DaemonNotRunningError } from '../../src/shared/errors.js';
import { DaemonClient } from '../../src/cli/daemon-client.js';
import { ensureDaemon } from '../../src/cli/daemon-launcher.js';

vi.mock('../../src/cli/daemon-client.js', () => ({
  DaemonClient: { fromDaemonState: vi.fn(), default: vi.fn() },
}));

const client = { marker: 'client' } as never;

describe('ensureDaemon', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the running daemon without launching another', async () => {
    vi.mocked(DaemonClient.fromDaemonState).mockResolvedValueOnce(client);
    const launch = vi.fn();
    await expect(ensureDaemon(launch)).resolves.toBe(client);
    expect(launch).not.toHaveBeenCalled();
  });

  it('starts the daemon when none is running, then connects to it', async () => {
    vi.mocked(DaemonClient.fromDaemonState)
      .mockRejectedValueOnce(new DaemonNotRunningError())
      .mockResolvedValueOnce(client);
    const launch = vi.fn().mockResolvedValue(undefined);
    await expect(ensureDaemon(launch)).resolves.toBe(client);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('does not mask other failures by launching', async () => {
    const boom = new AppiumAgentError('UNAUTHORIZED', 'bad token', 401);
    vi.mocked(DaemonClient.fromDaemonState).mockRejectedValueOnce(boom);
    const launch = vi.fn();
    await expect(ensureDaemon(launch)).rejects.toBe(boom);
    expect(launch).not.toHaveBeenCalled();
  });

  it('surfaces a failed launch', async () => {
    vi.mocked(DaemonClient.fromDaemonState).mockRejectedValueOnce(
      new DaemonNotRunningError(),
    );
    const failure = new AppiumAgentError('DAEMON_START_FAILED', 'exited');
    await expect(ensureDaemon(vi.fn().mockRejectedValue(failure))).rejects.toBe(failure);
  });
});
