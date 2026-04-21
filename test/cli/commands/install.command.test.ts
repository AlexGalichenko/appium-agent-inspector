import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { join } from 'node:path';
import { registerInstall } from '../../../src/cli/commands/install.command.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  cp: vi.fn(),
}));

describe('install command', () => {
  let program: Command;

  beforeEach(async () => {
    vi.resetAllMocks();

    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);

    const { mkdir, cp } = await import('node:fs/promises');
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(cp).mockResolvedValue(undefined);

    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    program = new Command();
    program.exitOverride();
    registerInstall(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits with error when --skill is not provided', async () => {
    await expect(
      program.parseAsync(['node', 'appium-agent', 'install']),
    ).rejects.toThrow('process.exit(1)');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('--skill'));
  });

  it('exits with error when bundled skill file is not found', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);

    await expect(
      program.parseAsync(['node', 'appium-agent', 'install', '--skill']),
    ).rejects.toThrow('process.exit(1)');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('bundled skill file not found'),
    );
  });

  it('creates the target .claude/skills directory with recursive option', async () => {
    await program.parseAsync(['node', 'appium-agent', 'install', '--skill']);

    const { mkdir } = await import('node:fs/promises');
    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining(join('.claude', 'skills', 'appium-agent')),
      { recursive: true },
    );
  });

  it('target directory is inside process.cwd()', async () => {
    await program.parseAsync(['node', 'appium-agent', 'install', '--skill']);

    const { mkdir } = await import('node:fs/promises');
    const [targetDir] = vi.mocked(mkdir).mock.calls[0] as [string, ...unknown[]];
    expect(targetDir).toMatch(process.cwd());
  });

  it('copies the bundled SKILL.md to the target location', async () => {
    await program.parseAsync(['node', 'appium-agent', 'install', '--skill']);

    const { cp } = await import('node:fs/promises');
    expect(cp).toHaveBeenCalledWith(
      expect.stringContaining('SKILL.md'),
      expect.stringContaining('SKILL.md'),
    );
  });

  it('checks the bundled skill file using the resolved source path', async () => {
    await program.parseAsync(['node', 'appium-agent', 'install', '--skill']);

    const { existsSync } = await import('node:fs');
    const [checkedPath] = vi.mocked(existsSync).mock.calls[0] as [string];
    expect(checkedPath).toContain(join('.claude', 'skills', 'appium-agent', 'SKILL.md'));
  });

  it('prints success message after installation', async () => {
    await program.parseAsync(['node', 'appium-agent', 'install', '--skill']);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Claude skill installed'),
    );
  });

  it('success message includes the target path', async () => {
    await program.parseAsync(['node', 'appium-agent', 'install', '--skill']);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(join('.claude', 'skills', 'appium-agent')),
    );
  });
});
