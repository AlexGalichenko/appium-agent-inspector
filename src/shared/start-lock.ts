import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { CONFIG_DIR, DAEMON_START_LOCK_FILE } from './constants.js';
import { AppiumAgentError } from './errors.js';
import { isDaemonProcessAlive } from './state-file.js';

const POLL_INTERVAL_MS = 200;

/**
 * A lock file is created and then written, so for a moment it exists without a
 * PID. Only treat an unreadable lock as abandoned once it is clearly not that.
 */
const UNREADABLE_LOCK_GRACE_MS = 5000;

export type ReleaseLock = () => Promise<void>;

/**
 * Serialises `daemon:start` across processes.
 *
 * Two starts racing past the "already running?" check would both spawn a
 * daemon; the second overwrites the state file and leaves the first running
 * where no command can find or stop it. The lock records its holder's PID, so
 * one left behind by a crashed CLI is reclaimed rather than blocking every
 * later start.
 */
export async function acquireStartLock(timeoutMs: number): Promise<ReleaseLock> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      await writeFile(DAEMON_START_LOCK_FILE, String(process.pid), {
        flag: 'wx',
        mode: 0o600,
      });
      return releaseStartLock;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }

    const holder = await readLock();
    if (holder === null) continue; // released between our attempt and the read

    if (isAbandoned(holder)) {
      await unlink(DAEMON_START_LOCK_FILE).catch(() => undefined);
      continue;
    }

    if (Date.now() >= deadline) {
      throw new AppiumAgentError(
        'DAEMON_START_LOCKED',
        `Another daemon:start (pid: ${holder.pid ?? 'unknown'}) is still in progress. Wait for it to finish, or delete ${DAEMON_START_LOCK_FILE} if that process is stuck.`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function releaseStartLock(): Promise<void> {
  const holder = await readLock();
  // Never remove a lock some other process has since claimed.
  if (holder?.pid === process.pid) {
    await unlink(DAEMON_START_LOCK_FILE).catch(() => undefined);
  }
}

interface LockHolder {
  pid: number | null;
  ageMs: number;
}

async function readLock(): Promise<LockHolder | null> {
  try {
    const [contents, info] = await Promise.all([
      readFile(DAEMON_START_LOCK_FILE, 'utf8'),
      stat(DAEMON_START_LOCK_FILE),
    ]);
    const pid = Number(contents.trim());
    return {
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
      ageMs: Date.now() - info.mtimeMs,
    };
  } catch {
    return null;
  }
}

function isAbandoned(holder: LockHolder): boolean {
  if (holder.pid === null) return holder.ageMs > UNREADABLE_LOCK_GRACE_MS;
  return !isDaemonProcessAlive(holder.pid);
}
