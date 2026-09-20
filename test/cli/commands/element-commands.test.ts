import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../../src/shared/errors.js';
import { registerClick } from '../../../src/cli/commands/click.command.js';
import { registerType } from '../../../src/cli/commands/type.command.js';
import { registerGetText } from '../../../src/cli/commands/get-text.command.js';
import { registerGetAttribute } from '../../../src/cli/commands/get-attribute.command.js';
import { registerGetLocation } from '../../../src/cli/commands/get-location.command.js';
import { registerFindElement } from '../../../src/cli/commands/find-element.command.js';
import { registerListElements } from '../../../src/cli/commands/list-elements.command.js';
import { registerWait } from '../../../src/cli/commands/wait.command.js';
import { firstArg, resolves, runCommand, runJson, useClient } from './helpers.js';

vi.mock('../../../src/cli/daemon-client.js', () => ({
  DaemonClient: { fromDaemonState: vi.fn() },
}));

afterEach(() => vi.restoreAllMocks());

const BY_ID = ['--element-id', 'el-1'];
const BY_LOCATOR = ['--strategy', 'accessibility id', '--selector', 'Login'];

describe('click', () => {
  let click: ReturnType<typeof resolves>;

  beforeEach(() => {
    click = resolves();
    useClient({ click });
  });

  it('sends a stored reference straight through', async () => {
    await runCommand(registerClick, ['click', ...BY_ID]);
    expect(firstArg(click)).toEqual({ elementId: 'el-1' });
  });

  it('sends a locator with the default index', async () => {
    await runCommand(registerClick, ['click', ...BY_LOCATOR]);
    expect(firstArg(click)).toEqual({
      strategy: 'accessibility id',
      selector: 'Login',
      index: 0,
    });
  });

  it('passes --index through as a number', async () => {
    await runCommand(registerClick, ['click', ...BY_LOCATOR, '--index', '3']);
    expect(firstArg(click).index).toBe(3);
  });

  it('confirms the click in human output', async () => {
    expect(await runCommand(registerClick, ['click', ...BY_ID])).toEqual(['Clicked.']);
  });

  it('reports the target it acted on under --json', async () => {
    expect(await runJson(registerClick, ['click', ...BY_ID])).toEqual({
      clicked: true,
      target: { elementId: 'el-1' },
    });
  });

  it('rejects a locator missing its selector before contacting the daemon', async () => {
    await expect(
      runCommand(registerClick, ['click', '--strategy', 'id']),
    ).rejects.toThrow(ValidationError);
    expect(click).not.toHaveBeenCalled();
  });

  it('rejects an unknown strategy and names the valid ones', async () => {
    await expect(
      runCommand(registerClick, ['click', '--strategy', 'magic', '--selector', 'x']),
    ).rejects.toThrow(/Unknown locator strategy.*accessibility id/s);
  });

  it('rejects a non-numeric --index', async () => {
    await expect(
      runCommand(registerClick, ['click', ...BY_LOCATOR, '--index', 'two']),
    ).rejects.toThrow(/--index/);
  });

  it('prefers --element-id when a locator is also given', async () => {
    await runCommand(registerClick, ['click', ...BY_ID, ...BY_LOCATOR]);
    expect(firstArg(click)).toEqual({ elementId: 'el-1' });
  });
});

describe('type', () => {
  let type: ReturnType<typeof resolves>;

  beforeEach(() => {
    type = resolves();
    useClient({ type });
  });

  it('appends without --clear', async () => {
    await runCommand(registerType, ['type', ...BY_ID, '--text', 'hello']);
    expect(firstArg(type)).toEqual({
      elementId: 'el-1',
      text: 'hello',
      clearFirst: false,
    });
  });

  it('replaces the field with --clear', async () => {
    await runCommand(registerType, ['type', ...BY_ID, '--text', 'hi', '--clear']);
    expect(firstArg(type).clearFirst).toBe(true);
  });

  it('preserves an empty string rather than dropping the field', async () => {
    await runCommand(registerType, ['type', ...BY_ID, '--text', '']);
    expect(firstArg(type).text).toBe('');
  });

  it('requires --text', async () => {
    await expect(runCommand(registerType, ['type', ...BY_ID])).rejects.toThrow(/--text/);
  });
});

describe('get-text', () => {
  it('prints the text bare, so it can be piped', async () => {
    useClient({ getText: resolves({ text: 'Sign in' }) });
    expect(await runCommand(registerGetText, ['get-text', ...BY_ID])).toEqual([
      'Sign in',
    ]);
  });

  it('prints an empty line for an empty element', async () => {
    useClient({ getText: resolves({ text: '' }) });
    expect(await runCommand(registerGetText, ['get-text', ...BY_ID])).toEqual(['']);
  });

  it('returns the daemon payload verbatim under --json', async () => {
    useClient({ getText: resolves({ text: 'Sign in' }) });
    expect(await runJson(registerGetText, ['get-text', ...BY_ID])).toEqual({
      text: 'Sign in',
    });
  });
});

describe('get-attribute', () => {
  it('merges the attribute name into the target', async () => {
    const getAttribute = resolves({ attribute: 'enabled', value: 'true' });
    useClient({ getAttribute });

    await runCommand(registerGetAttribute, [
      'get-attribute',
      ...BY_ID,
      '--attribute',
      'enabled',
    ]);

    expect(firstArg(getAttribute)).toEqual({
      elementId: 'el-1',
      attribute: 'enabled',
    });
  });

  it('prints name and value', async () => {
    useClient({ getAttribute: resolves({ attribute: 'enabled', value: 'true' }) });
    const lines = await runCommand(registerGetAttribute, [
      'get-attribute',
      ...BY_ID,
      '--attribute',
      'enabled',
    ]);
    expect(lines).toEqual(['enabled: true']);
  });

  it('renders a null value without crashing', async () => {
    useClient({ getAttribute: resolves({ attribute: 'hint', value: null }) });
    const lines = await runCommand(registerGetAttribute, [
      'get-attribute',
      ...BY_ID,
      '--attribute',
      'hint',
    ]);
    expect(lines).toEqual(['hint: null']);
  });

  it('requires --attribute', async () => {
    useClient({ getAttribute: resolves() });
    await expect(
      runCommand(registerGetAttribute, ['get-attribute', ...BY_ID]),
    ).rejects.toThrow(/--attribute/);
  });
});

describe('get-location', () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };

  it('derives the tappable centre from the rect', async () => {
    useClient({ getElementLocation: resolves(rect) });
    expect(await runJson(registerGetLocation, ['get-location', ...BY_ID])).toEqual({
      ...rect,
      center: { x: 60, y: 45 },
    });
  });

  it('rounds a centre that lands between pixels', async () => {
    useClient({
      getElementLocation: resolves({ x: 0, y: 0, width: 101, height: 101 }),
    });
    const result = await runJson<{ center: { x: number; y: number } }>(
      registerGetLocation,
      ['get-location', ...BY_ID],
    );
    expect(result.center).toEqual({ x: 51, y: 51 });
  });

  it('prints position, size and centre', async () => {
    useClient({ getElementLocation: resolves(rect) });
    expect(await runCommand(registerGetLocation, ['get-location', ...BY_ID])).toEqual([
      'x: 10, y: 20',
      'width: 100, height: 50',
      'center: 60,45',
    ]);
  });
});

describe('find-element', () => {
  const found = {
    elementId: 'el-9',
    selector: 'Login',
    strategy: 'accessibility id',
    index: 0,
    foundAt: '2026-01-01T00:00:00.000Z',
    matchCount: 1,
  };

  it('sends the parsed locator to the single-element endpoint', async () => {
    const findElement = resolves(found);
    useClient({ findElement, findElements: resolves() });

    await runCommand(registerFindElement, ['find-element', ...BY_LOCATOR]);

    expect(firstArg(findElement)).toEqual({
      strategy: 'accessibility id',
      selector: 'Login',
      index: 0,
      all: false,
    });
  });

  it('stays quiet about ambiguity when the selector is unique', async () => {
    useClient({ findElement: resolves(found), findElements: resolves() });
    const lines = await runCommand(registerFindElement, ['find-element', ...BY_LOCATOR]);
    expect(lines.join('\n')).not.toMatch(/Note:/);
  });

  it('prints only the ID, not a restatement of the locator just passed in', async () => {
    useClient({ findElement: resolves(found), findElements: resolves() });
    const lines = await runCommand(registerFindElement, ['find-element', ...BY_LOCATOR]);
    expect(lines).toEqual(['ID: el-9']);
  });

  it('still carries the full record under --json', async () => {
    useClient({ findElement: resolves(found), findElements: resolves() });
    const result = await runJson(registerFindElement, ['find-element', ...BY_LOCATOR]);
    expect(result).toEqual(found);
  });

  it('warns which index it stored when the selector is ambiguous', async () => {
    useClient({
      findElement: resolves({ ...found, matchCount: 4 }),
      findElements: resolves(),
    });
    const lines = await runCommand(registerFindElement, ['find-element', ...BY_LOCATOR]);
    expect(lines.join('\n')).toMatch(/matches 4 elements; stored index 0/);
  });

  it('switches to the batch endpoint for --all', async () => {
    const findElements = resolves({
      matchCount: 2,
      elements: [
        { ...found, elementId: 'a', index: 0, matchCount: 2 },
        { ...found, elementId: 'b', index: 1, matchCount: 2 },
      ],
    });
    const findElement = resolves(found);
    useClient({ findElement, findElements });

    const lines = await runCommand(registerFindElement, [
      'find-element',
      ...BY_LOCATOR,
      '--all',
    ]);

    expect(findElement).not.toHaveBeenCalled();
    expect(firstArg(findElements).all).toBe(true);
    expect(lines).toEqual(['2 element(s) found:', '  [0] ID: a', '  [1] ID: b']);
  });

  it('requires both --strategy and --selector', async () => {
    useClient({ findElement: resolves(found) });
    await expect(
      runCommand(registerFindElement, ['find-element', '--strategy', 'id']),
    ).rejects.toThrow(/--selector/);
  });
});

describe('list-elements', () => {
  const ref = {
    id: 'el-1',
    selector: 'Login',
    strategy: 'accessibility id' as const,
    index: 0,
    foundAt: '2026-01-01T00:00:00.000Z',
    sessionId: 'sess-1',
  };

  it('lists every stored reference', async () => {
    useClient({ listElements: resolves({ elements: [ref] }), getElement: resolves() });
    const lines = await runCommand(registerListElements, ['list-elements']);
    expect(lines).toEqual([
      '1 stored reference(s):',
      '  el-1  [accessibility id] "Login" #0',
    ]);
  });

  it('points at find-element when nothing is stored', async () => {
    useClient({ listElements: resolves({ elements: [] }), getElement: resolves() });
    const lines = await runCommand(registerListElements, ['list-elements']);
    expect(lines.join('\n')).toMatch(/No stored element references.*find-element/);
  });

  it('reports the count alongside the rows under --json', async () => {
    useClient({ listElements: resolves({ elements: [ref] }), getElement: resolves() });
    expect(await runJson(registerListElements, ['list-elements'])).toEqual({
      count: 1,
      elements: [ref],
    });
  });

  it('fetches a single reference with --id', async () => {
    const getElement = resolves(ref);
    useClient({ listElements: resolves({ elements: [] }), getElement });

    await runCommand(registerListElements, ['list-elements', '--id', 'el-1']);

    expect(getElement).toHaveBeenCalledWith('el-1');
  });

  it('omits the fingerprint line for a unique reference', async () => {
    useClient({ listElements: resolves(), getElement: resolves(ref) });
    const lines = await runCommand(registerListElements, [
      'list-elements',
      '--id',
      'el-1',
    ]);
    expect(lines.join('\n')).not.toMatch(/Fingerprint/);
  });

  it('shows the fingerprint that marks a positional reference', async () => {
    useClient({
      listElements: resolves(),
      getElement: resolves({ ...ref, index: 2, fingerprint: 'Row 3' }),
    });
    const lines = await runCommand(registerListElements, [
      'list-elements',
      '--id',
      'el-1',
    ]);
    expect(lines).toContain('Fingerprint: "Row 3"');
  });
});

describe('wait', () => {
  let waitForElement: ReturnType<typeof resolves>;

  beforeEach(() => {
    waitForElement = resolves({
      condition: 'displayed',
      selector: 'Login',
      waitedMs: 120,
    });
    useClient({ waitForElement });
  });

  it('defaults to waiting for the element to be displayed', async () => {
    await runCommand(registerWait, ['wait', ...BY_LOCATOR]);
    expect(firstArg(waitForElement)).toEqual({
      strategy: 'accessibility id',
      selector: 'Login',
      condition: 'displayed',
      timeout: 10_000,
    });
  });

  it('passes an explicit condition through', async () => {
    await runCommand(registerWait, ['wait', ...BY_LOCATOR, '--for', 'gone']);
    expect(firstArg(waitForElement).condition).toBe('gone');
  });

  it('rejects an unknown condition and names the valid ones', async () => {
    await expect(
      runCommand(registerWait, ['wait', ...BY_LOCATOR, '--for', 'sideways']),
    ).rejects.toThrow(/Unknown condition.*existing, displayed, gone, enabled/s);
  });

  it('parses --timeout as milliseconds', async () => {
    await runCommand(registerWait, ['wait', ...BY_LOCATOR, '--timeout', '2500']);
    expect(firstArg(waitForElement).timeout).toBe(2500);
  });

  it('rejects a timeout past the daemon bound before making a request', async () => {
    await expect(
      runCommand(registerWait, ['wait', ...BY_LOCATOR, '--timeout', '600001']),
    ).rejects.toThrow(/--timeout/);
    expect(waitForElement).not.toHaveBeenCalled();
  });

  it('rejects a zero timeout', async () => {
    await expect(
      runCommand(registerWait, ['wait', ...BY_LOCATOR, '--timeout', '0']),
    ).rejects.toThrow(/--timeout/);
  });

  it('reports how long it actually waited', async () => {
    const lines = await runCommand(registerWait, ['wait', ...BY_LOCATOR]);
    expect(lines).toEqual(['"Login" is displayed (after 120ms).']);
  });
});
