import { rm } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_DIR } from '../../src/shared/constants.js';
import {
  diffTrees,
  readScreen,
  readScreenDiff,
  screenAfter,
} from '../../src/cli/screen.js';
import type { DaemonClient } from '../../src/cli/daemon-client.js';

const xml = (...buttons: string[]) =>
  `<AppiumAUT><XCUIElementTypeApplication name="App">${buttons
    .map((b) => `<XCUIElementTypeButton name="${b}"/>`)
    .join('')}</XCUIElementTypeApplication></AppiumAUT>`;

function clientShowing(...screens: string[]) {
  const getPageSource = vi.fn();
  for (const s of screens) getPageSource.mockResolvedValueOnce({ source: s });
  return { getPageSource } as unknown as DaemonClient;
}

describe('diffTrees', () => {
  const before = ['- application "App":', '  - button "A"', '  - button "B"'].join('\n');

  it('says so when nothing changed', () => {
    expect(diffTrees(before, before)).toBe('# no changes since the last read');
  });

  it('shows a changed line as removal then addition, under its ancestors', () => {
    const tree = [
      '- application "App":',
      '  - list "L":',
      ...Array.from({ length: 6 }, (_, i) => `    - cell "Row ${i}"`),
      '    - textfield "Email" [value="a"]',
    ];
    const after = [...tree.slice(0, -1), '    - textfield "Email" [value="ab"]'];
    expect(diffTrees(tree.join('\n'), after.join('\n'))).toBe(
      [
        '# changes since the last read (+1 -1):',
        '  - application "App":',
        '    - list "L":',
        '-     - textfield "Email" [value="a"]',
        '+     - textfield "Email" [value="ab"]',
      ].join('\n'),
    );
  });

  it("places a removed row's children under that row, not the row before it", () => {
    const rows = (names: string[]) =>
      names.flatMap((n) => [
        `  - cell "${n}":`,
        `    - textfield "Title" [value="${n}"]`,
      ]);
    const keep = ['A', 'B', 'C', 'D', 'E', 'F'];
    const old = ['- application "App":', ...rows(['Milk', 'Eggs', ...keep])];
    const now = ['- application "App":', ...rows(['Milk', ...keep])];
    expect(diffTrees(old.join('\n'), now.join('\n'))).toBe(
      [
        '# changes since the last read (+0 -2):',
        '  - application "App":',
        '-   - cell "Eggs":',
        '-     - textfield "Title" [value="Eggs"]',
      ].join('\n'),
    );
  });

  it('prints the whole unchanged ancestor path, outermost first', () => {
    const tree = (done: string, first: string) => [
      '- application "Contacts":',
      '  - navigationbar "New Contact":',
      `    - button "Done"${done}`,
      ...Array.from({ length: 6 }, (_, i) => `  - cell "row ${i}"`),
      `  - textfield "First name"${first}`,
    ];
    expect(
      diffTrees(
        tree(' [disabled]', '').join('\n'),
        tree('', ' [value="Ada"]').join('\n'),
      ),
    ).toBe(
      [
        '# changes since the last read (+2 -2):',
        '  - application "Contacts":',
        '    - navigationbar "New Contact":',
        '-     - button "Done" [disabled]',
        '+     - button "Done"',
        '-   - textfield "First name"',
        '+   - textfield "First name" [value="Ada"]',
      ].join('\n'),
    );
  });

  it('gives up (full tree) when most of the screen changed', () => {
    expect(diffTrees(before, '- application "Other":\n  - button "Z"')).toBeNull();
  });
});

describe('readScreenDiff', () => {
  beforeEach(async () => {
    // vitest.config.ts points CONFIG_DIR at a temp directory; refuse to wipe
    // anything else, such as a real ~/.appium-agent.
    expect(CONFIG_DIR).toContain('appium-agent-vitest-');
    await rm(CONFIG_DIR, { recursive: true, force: true });
  });

  it('prints the full tree when there is no earlier read', async () => {
    const result = await readScreenDiff(clientShowing(xml('A', 'B')));
    expect(result).toEqual({ tree: expect.stringContaining('button "A"') });
  });

  it('diffs against the screen the previous read saw', async () => {
    const many = Array.from({ length: 8 }, (_, i) => `B${i}`);
    const client = clientShowing(xml(...many), xml(...many, 'New'));
    await readScreen(client);
    const result = await readScreenDiff(client);
    expect(result).toEqual({ diff: expect.stringContaining('+   - button "New"') });
  });

  it('never compares trees rendered with different options', async () => {
    const client = clientShowing(xml('A'), xml('A'));
    await readScreen(client, { bounds: false });
    expect(await readScreenDiff(client, { collapse: false })).toHaveProperty('tree');
  });
});

describe('screenAfter', () => {
  it('reads the screen only when --source was given', async () => {
    const client = clientShowing(xml('A'));
    await expect(screenAfter(client, { source: false })).resolves.toEqual({});
    expect(client.getPageSource).not.toHaveBeenCalled();
    await expect(screenAfter(client, { source: true })).resolves.toEqual({
      tree: expect.stringContaining('button "A"'),
    });
  });
});
