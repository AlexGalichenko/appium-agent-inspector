import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveLocalPath } from '../../src/cli/paths.js';

describe('resolveLocalPath', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'appium-paths-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('resolves a relative path against the caller, not the Appium server', () => {
    writeFileSync(join(dir, 'app.apk'), '');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    expect(resolveLocalPath('app.apk')).toBe(join(dir, 'app.apk'));
  });

  it('leaves a URL untouched', () => {
    const url = 'https://example.com/builds/app.apk';
    expect(resolveLocalPath(url)).toBe(url);
  });

  it('leaves an absolute path untouched', () => {
    expect(resolveLocalPath('/opt/builds/app.ipa')).toBe('/opt/builds/app.ipa');
  });

  it('leaves a relative path that does not exist here, as it may be on the Appium host', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    expect(resolveLocalPath('builds/app.apk')).toBe('builds/app.apk');
  });
});
