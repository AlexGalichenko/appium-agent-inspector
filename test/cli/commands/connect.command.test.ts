import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationError } from '../../../src/shared/errors.js';
import { parseCaps } from '../../../src/cli/commands/connect.command.js';

describe('parseCaps', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'appium-caps-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('parses an inline JSON object', () => {
    expect(parseCaps('{"platformName":"iOS"}')).toEqual({ platformName: 'iOS' });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseCaps('  {"platformName":"iOS"}  ')).toEqual({ platformName: 'iOS' });
  });

  it('reads capabilities from a file path', () => {
    const file = join(dir, 'caps.json');
    writeFileSync(file, JSON.stringify({ platformName: 'Android' }));
    expect(parseCaps(file)).toEqual({ platformName: 'Android' });
  });

  it('resolves a relative file path', () => {
    const file = join(dir, 'caps.json');
    writeFileSync(file, JSON.stringify({ platformName: 'Android' }));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    expect(parseCaps('caps.json')).toEqual({ platformName: 'Android' });
  });

  it('reports malformed inline JSON as a validation error', () => {
    expect(() => parseCaps('{not json}')).toThrow(ValidationError);
    expect(() => parseCaps('{not json}')).toThrow(/not valid JSON/);
  });

  it('names the path it could not read', () => {
    const missing = join(dir, 'nope.json');
    expect(() => parseCaps(missing)).toThrow(ValidationError);
    expect(() => parseCaps(missing)).toThrow(
      new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  });

  it('reports a file that exists but holds invalid JSON', () => {
    const file = join(dir, 'bad.json');
    writeFileSync(file, 'nope');
    expect(() => parseCaps(file)).toThrow(/not valid JSON/);
  });
});
