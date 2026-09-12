import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The lock path is fixed when constants load, so point it at a scratch
// directory before importing anything that reads it.
const home = mkdtempSync(join(tmpdir(), 'appium-lock-'));
process.env['APPIUM_AGENT_HOME'] = home;
const { acquireStartLock } = await import('../../src/shared/start-lock.js');
const { DAEMON_START_LOCK_FILE } = await import('../../src/shared/constants.js');

/** A PID far above any real process table. */
const DEAD_PID = 2_000_000_000;

describe('acquireStartLock', () => {
  afterEach(() => {
    rmSync(DAEMON_START_LOCK_FILE, { force: true });
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('creates the lock with its own PID and removes it on release', async () => {
    const release = await acquireStartLock(1000);
    expect(readFileSync(DAEMON_START_LOCK_FILE, 'utf8')).toBe(String(process.pid));

    await release();
    expect(existsSync(DAEMON_START_LOCK_FILE)).toBe(false);
  });

  it('gives up with DAEMON_START_LOCKED while a live process holds the lock', async () => {
    writeFileSync(DAEMON_START_LOCK_FILE, String(process.pid));
    await expect(acquireStartLock(300)).rejects.toMatchObject({
      code: 'DAEMON_START_LOCKED',
    });
  });

  it('waits for the holder to finish instead of failing at once', async () => {
    writeFileSync(DAEMON_START_LOCK_FILE, String(process.pid));
    setTimeout(() => rmSync(DAEMON_START_LOCK_FILE, { force: true }), 300);

    const release = await acquireStartLock(3000);
    await release();
  });

  it('reclaims a lock left behind by a process that no longer exists', async () => {
    writeFileSync(DAEMON_START_LOCK_FILE, String(DEAD_PID));
    const release = await acquireStartLock(1000);
    expect(readFileSync(DAEMON_START_LOCK_FILE, 'utf8')).toBe(String(process.pid));
    await release();
  });

  it('treats a freshly created lock without a PID yet as held', async () => {
    writeFileSync(DAEMON_START_LOCK_FILE, '');
    await expect(acquireStartLock(300)).rejects.toMatchObject({
      code: 'DAEMON_START_LOCKED',
    });
  });

  it('reclaims an unreadable lock once it is clearly abandoned', async () => {
    writeFileSync(DAEMON_START_LOCK_FILE, '');
    const longAgo = new Date(Date.now() - 60_000);
    utimesSync(DAEMON_START_LOCK_FILE, longAgo, longAgo);

    const release = await acquireStartLock(1000);
    await release();
  });

  it('does not remove a lock another process has since claimed', async () => {
    const release = await acquireStartLock(1000);
    writeFileSync(DAEMON_START_LOCK_FILE, '12345');

    await release();
    expect(readFileSync(DAEMON_START_LOCK_FILE, 'utf8')).toBe('12345');
  });
});
