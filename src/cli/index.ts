#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { AppiumAgentError } from '../shared/errors.js';
import { registerStartDaemon } from './commands/start-daemon.command.js';
import { registerKillDaemon } from './commands/kill-daemon.command.js';
import { registerConnect } from './commands/connect.command.js';
import { registerDeleteSession } from './commands/delete-session.command.js';
import { registerSessionStatus } from './commands/session-status.command.js';
import { registerContext } from './commands/context.command.js';
import { registerDeviceInfo } from './commands/device-info.command.js';
import { registerFindElement } from './commands/find-element.command.js';
import { registerWait } from './commands/wait.command.js';
import { registerClick } from './commands/click.command.js';
import { registerType } from './commands/type.command.js';
import { registerGetText } from './commands/get-text.command.js';
import { registerScroll } from './commands/scroll.command.js';
import { registerPageSource } from './commands/page-source.command.js';
import { registerActivateApp } from './commands/activate-app.command.js';
import { registerTerminateApp } from './commands/terminate-app.command.js';
import { registerInstallApp } from './commands/install-app.command.js';
import { registerTakeScreenshot } from './commands/take-screenshot.command.js';
import { registerExecute } from './commands/execute.command.js';
import { registerVideoStart } from './commands/video-start.command.js';
import { registerVideoStop } from './commands/video-stop.command.js';
import { registerGetAttribute } from './commands/get-attribute.command.js';
import { registerGetLocation } from './commands/get-location.command.js';
import { registerPerformAction } from './commands/perform-action.command.js';
import { registerInstall } from './commands/install.command.js';

/** Single source of truth for the version, so --version can never drift. */
function packageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const pkg = JSON.parse(
      readFileSync(join(here, '..', '..', 'package.json'), 'utf8'),
    ) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('appium-agent')
  .description('Appium daemon CLI — persistent session management for mobile automation')
  .version(packageVersion())
  .option('--json', 'Print machine-readable JSON instead of human text', false);

registerStartDaemon(program);
registerKillDaemon(program);
registerConnect(program);
registerDeleteSession(program);
registerSessionStatus(program);
registerContext(program);
registerDeviceInfo(program);
registerFindElement(program);
registerWait(program);
registerClick(program);
registerType(program);
registerGetText(program);
registerScroll(program);
registerPageSource(program);
registerActivateApp(program);
registerTerminateApp(program);
registerInstallApp(program);
registerTakeScreenshot(program);
registerExecute(program);
registerVideoStart(program);
registerVideoStop(program);
registerGetAttribute(program);
registerGetLocation(program);
registerPerformAction(program);
registerInstall(program);

function reportError(err: unknown): never {
  const asJson = program.opts()['json'] === true;

  if (err instanceof AppiumAgentError) {
    if (asJson) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: { code: err.code, message: err.message, details: err.details },
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`Error [${err.code}]: ${err.message}`);
      if (err.details !== undefined) {
        console.error(
          typeof err.details === 'string' ? err.details : JSON.stringify(err.details),
        );
      }
    }
    process.exit(1);
  }

  const message = err instanceof Error ? err.message : String(err);
  if (asJson) {
    console.error(
      JSON.stringify({ ok: false, error: { code: 'UNKNOWN', message } }, null, 2),
    );
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

async function run() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    reportError(err);
  }
}

void run();
