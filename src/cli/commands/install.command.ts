import type { Command } from 'commander';
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_NAME = 'appium-agent';

export function registerInstall(program: Command): void {
  program
    .command('install')
    .description('Install supplementary assets for appium-agent')
    .option('--skill', 'Install the Claude skill to .claude/skills/')
    .action(async (opts: { skill?: boolean }) => {
      if (!opts.skill) {
        console.error('Error: specify what to install (e.g. --skill)');
        process.exit(1);
      }

      const __dirname = dirname(fileURLToPath(import.meta.url));
      // dist/cli/commands/ → ../../.. → project root
      const skillSrc = join(__dirname, '../../..', '.claude', 'skills', SKILL_NAME, 'SKILL.md');

      if (!existsSync(skillSrc)) {
        console.error(`Error: bundled skill file not found at ${skillSrc}`);
        process.exit(1);
      }

      const targetDir = join(process.cwd(), '.claude', 'skills', SKILL_NAME);
      const targetFile = join(targetDir, 'SKILL.md');

      await mkdir(targetDir, { recursive: true });
      await cp(skillSrc, targetFile);

      console.log(`Claude skill installed: .claude/skills/${SKILL_NAME}/SKILL.md`);
    });
}
