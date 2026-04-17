import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CONFIG_DIR, DAEMON_STATE_FILE } from '../shared/constants.js';
import type { DaemonState } from '../shared/types.js';

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

export function isDaemonProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
