import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { CONFIG_DIR, DAEMON_STATE_FILE, DAEMON_TOKEN_HEADER } from './constants.js';
import type { DaemonState } from './types.js';

export async function ensureConfigDir(): Promise<string> {
  await mkdir(CONFIG_DIR, { recursive: true });
  return CONFIG_DIR;
}

export async function writeDaemonState(state: DaemonState): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(DAEMON_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function readDaemonState(): Promise<DaemonState | null> {
  try {
    const raw = await readFile(DAEMON_STATE_FILE, 'utf8');
    return JSON.parse(raw) as DaemonState;
  } catch {
    return null;
  }
}

export async function removeDaemonState(): Promise<void> {
  try {
    await unlink(DAEMON_STATE_FILE);
  } catch {
    // ignore if already gone
  }
}

/**
 * Removes the state file only when it still describes this process.
 *
 * A daemon can take a second or two to shut down, which is long enough for a
 * replacement to bind a port and claim the state file. An unconditional delete
 * on shutdown would then erase the *new* daemon's record and leave a running
 * daemon the CLI cannot find.
 */
export async function removeDaemonStateIfOwnedBy(pid: number): Promise<boolean> {
  const state = await readDaemonState();
  if (state === null) return false;
  if (state.pid !== pid) return false;

  await removeDaemonState();
  return true;
}

export function isDaemonProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Confirms a daemon is really answering on `state.port` and is *our* daemon.
 *
 * A PID check alone is not enough: after a crash the PID can be reused by an
 * unrelated process, which would make the CLI report "already running" and then
 * fail every subsequent command.
 */
export async function isDaemonHealthy(
  state: DaemonState,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/health`, {
      headers: { [DAEMON_TOKEN_HEADER]: state.token ?? '' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { data?: { service?: string } };
    return body.data?.service === 'appium-agent';
  } catch {
    return false;
  }
}

/**
 * Returns the state of a daemon that is actually reachable, else null.
 *
 * The state file is only cleared when the recorded process is genuinely gone.
 * A live process that fails one health probe (a slow machine, a request
 * arriving mid-startup) keeps its record: deleting it there would orphan a
 * perfectly good daemon that no later command could find or stop.
 */
export async function findRunningDaemon(): Promise<DaemonState | null> {
  const state = await readDaemonState();
  if (state === null) return null;

  if (await isDaemonHealthy(state)) return state;

  if (!isDaemonProcessAlive(state.pid)) {
    await removeDaemonStateIfOwnedBy(state.pid);
  }

  return null;
}
