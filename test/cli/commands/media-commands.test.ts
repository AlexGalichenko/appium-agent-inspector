import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { registerTakeScreenshot } from '../../../src/cli/commands/take-screenshot.command.js';
import { registerVideoStart } from '../../../src/cli/commands/video-start.command.js';
import { registerVideoStop } from '../../../src/cli/commands/video-stop.command.js';
import { registerPageSource } from '../../../src/cli/commands/page-source.command.js';
import { resolves, runCommand, runJson, useClient } from './helpers.js';

vi.mock('../../../src/cli/daemon-client.js', () => ({
  DaemonClient: { fromDaemonState: vi.fn() },
}));

vi.mock('node:fs/promises', () => ({ writeFile: vi.fn() }));

/** "hello" — short enough to assert on, real base64 so the decode is exercised. */
const B64 = 'aGVsbG8=';
const CAPTURED_AT = '2026-01-01T00:00:00.000Z';

async function writeFileMock() {
  const { writeFile } = await import('node:fs/promises');
  return vi.mocked(writeFile);
}

beforeEach(async () => {
  (await writeFileMock()).mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('take-screenshot', () => {
  beforeEach(() => {
    useClient({ takeScreenshot: resolves({ data: B64, capturedAt: CAPTURED_AT }) });
  });

  it('saves a decoded PNG rather than printing megabytes of base64', async () => {
    await runCommand(registerTakeScreenshot, ['take-screenshot']);

    const [path, buffer] = (await writeFileMock()).mock.calls[0] as [string, Buffer];
    expect(path.startsWith(tmpdir())).toBe(true);
    expect(path.endsWith('.png')).toBe(true);
    expect(buffer.toString('utf8')).toBe('hello');
  });

  it('honours an explicit --output path', async () => {
    await runCommand(registerTakeScreenshot, [
      'take-screenshot',
      '--output',
      '/tmp/shot.png',
    ]);
    expect((await writeFileMock()).mock.calls[0]![0]).toBe('/tmp/shot.png');
  });

  it('reports where it saved the file', async () => {
    const lines = await runCommand(registerTakeScreenshot, [
      'take-screenshot',
      '--output',
      '/tmp/shot.png',
    ]);
    expect(lines.join('\n')).toMatch(/Screenshot saved to \/tmp\/shot\.png/);
  });

  it('returns the path, not the payload, under --json', async () => {
    const result = await runJson(registerTakeScreenshot, [
      'take-screenshot',
      '--output',
      '/tmp/shot.png',
    ]);
    expect(result).toEqual({ path: '/tmp/shot.png', capturedAt: CAPTURED_AT });
  });

  it('prints raw base64 and writes nothing with --base64', async () => {
    const lines = await runCommand(registerTakeScreenshot, [
      'take-screenshot',
      '--base64',
    ]);
    expect(lines).toEqual([B64]);
    expect(await writeFileMock()).not.toHaveBeenCalled();
  });

  it('includes the payload under --json --base64', async () => {
    const result = await runJson(registerTakeScreenshot, ['take-screenshot', '--base64']);
    expect(result).toEqual({ data: B64, capturedAt: CAPTURED_AT });
  });
});

describe('video-start', () => {
  it('starts recording and says so', async () => {
    const startVideoRecording = resolves();
    useClient({ startVideoRecording });
    expect(await runCommand(registerVideoStart, ['video-start'])).toEqual([
      'Recording started.',
    ]);
    expect(startVideoRecording).toHaveBeenCalledOnce();
  });
});

describe('video-stop', () => {
  beforeEach(() => {
    useClient({ stopVideoRecording: resolves({ data: B64, stoppedAt: CAPTURED_AT }) });
  });

  it('saves the recording to a temp .mp4 by default', async () => {
    await runCommand(registerVideoStop, ['video-stop']);

    const [path, buffer] = (await writeFileMock()).mock.calls[0] as [string, Buffer];
    expect(path.startsWith(tmpdir())).toBe(true);
    expect(path.endsWith('.mp4')).toBe(true);
    expect(buffer.toString('utf8')).toBe('hello');
  });

  it('honours a positional output path', async () => {
    await runCommand(registerVideoStop, ['video-stop', '/tmp/clip.mp4']);
    expect((await writeFileMock()).mock.calls[0]![0]).toBe('/tmp/clip.mp4');
  });

  it('prints raw base64 and writes nothing with --base64', async () => {
    const lines = await runCommand(registerVideoStop, ['video-stop', '--base64']);
    expect(lines).toEqual([B64]);
    expect(await writeFileMock()).not.toHaveBeenCalled();
  });

  it('reports the saved path under --json', async () => {
    const result = await runJson(registerVideoStop, ['video-stop', '/tmp/clip.mp4']);
    expect(result).toEqual({ path: '/tmp/clip.mp4', stoppedAt: CAPTURED_AT });
  });
});

describe('page-source', () => {
  const XML = `<hierarchy><XCUIElementTypeButton name="Login" visible="true" x="0" y="0" width="100" height="40"/></hierarchy>`;

  beforeEach(() => {
    useClient({ getPageSource: resolves({ source: XML, capturedAt: CAPTURED_AT }) });
  });

  it('renders the compact accessibility tree by default', async () => {
    const lines = await runCommand(registerPageSource, ['page-source']);
    expect(lines.join('\n')).toBe('- button "Login"');
  });

  it('prints the raw XML with --raw', async () => {
    const lines = await runCommand(registerPageSource, ['page-source', '--raw']);
    expect(lines.join('\n')).toBe(XML);
  });

  it('adds tap coordinates with --bounds', async () => {
    const lines = await runCommand(registerPageSource, ['page-source', '--bounds']);
    expect(lines.join('\n')).toBe('- button "Login" [@50,20 100x40]');
  });

  it('collapses repeated rows by default and lists them with --no-collapse', async () => {
    const row = (i: number) =>
      `<XCUIElementTypeCell name="Row ${i}" visible="true" x="0" y="${i * 40}" width="390" height="40">` +
      `<XCUIElementTypeStaticText name="T${i}" visible="true" x="0" y="${i * 40}" width="100" height="40"/>` +
      `<XCUIElementTypeButton name="Go" visible="true" x="300" y="${i * 40}" width="80" height="40"/>` +
      `</XCUIElementTypeCell>`;
    const list = `<hierarchy><XCUIElementTypeTable name="List" visible="true" x="0" y="0" width="390" height="844">${row(0)}${row(1)}${row(2)}</XCUIElementTypeTable></hierarchy>`;
    useClient({ getPageSource: resolves({ source: list, capturedAt: CAPTURED_AT }) });

    const collapsed = await runCommand(registerPageSource, ['page-source']);
    expect(collapsed.join('\n')).toContain('same-shape siblings');

    const full = await runCommand(registerPageSource, ['page-source', '--no-collapse']);
    expect(full.join('\n')).not.toContain('same-shape siblings');
    expect(full.join('\n')).toContain('- cell "Row 2":');
  });

  it('carries the rendered tree and capture time under --json', async () => {
    const result = await runJson<{ tree: string; capturedAt: string }>(
      registerPageSource,
      ['page-source'],
    );
    expect(result).toEqual({ capturedAt: CAPTURED_AT, tree: '- button "Login"' });
  });
});
