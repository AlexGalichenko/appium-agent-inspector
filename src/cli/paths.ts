import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const URL_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

/**
 * Makes a relative local path absolute against the caller's working directory.
 *
 * App paths are opened by the Appium server, which resolves a relative path
 * against its own working directory, not the one the command ran in. URLs,
 * absolute paths, and paths that do not exist locally (they may be meant for a
 * remote Appium host) are returned unchanged.
 */
export function resolveLocalPath(value: string): string {
  if (URL_SCHEME.test(value) || isAbsolute(value)) return value;
  const absolute = resolve(value);
  return existsSync(absolute) ? absolute : value;
}
