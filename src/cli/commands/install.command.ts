import type { Command } from 'commander';
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeOutput } from '../output.js';
import { ValidationError } from '../../shared/errors.js';

const SKILL_NAME = 'appium-agent';

export function registerInstall(program: Command): void {
  const out = makeOutput(program);

  program
    .command('install')
    .description('Install supplementary assets for appium-agent')
    .option('--skill', 'Install the Claude skill to .claude/skills/')
    .option('--force', 'Overwrite an existing SKILL.md', false)
    .action(async (opts: { skill?: boolean; force: boolean }) => {
      if (!opts.skill) {
        throw new ValidationError('Specify what to install (e.g. --skill).');
      }

      const __dirname = dirname(fileURLToPath(import.meta.url));
      // dist/cli/commands/ → ../../.. → project root
      const skillDir = join(__dirname, '../../..', '.claude', 'skills', SKILL_NAME);
      const skillSrc = join(skillDir, 'SKILL.md');

      if (!existsSync(skillSrc)) {
        throw new ValidationError(`Bundled skill file not found at ${skillSrc}`);
      }

      const targetDir = join(process.cwd(), '.claude', 'skills', SKILL_NAME);
      const targetFile = join(targetDir, 'SKILL.md');

      // A skill file is meant to be edited. Overwriting one silently discards
      // whatever the user tuned for their own app.
      if (!opts.force && existsSync(targetFile)) {
        throw new ValidationError(
          `${targetFile} already exists. Re-run with --force to overwrite it.`,
        );
      }

      // SKILL.md points at references/ for anything it does not carry itself, so
      // copying the file alone would install a skill with dead links in it.
      await mkdir(targetDir, { recursive: true });
      await cp(skillDir, targetDir, { recursive: true });

      out.emit({ installed: true, path: targetDir }, () =>
        console.log(`Claude skill installed: .claude/skills/${SKILL_NAME}/`),
      );
    });
}
