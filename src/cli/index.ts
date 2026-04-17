#!/usr/bin/env node
import { Command } from 'commander';
import { DaemonNotRunningError, AppiumAgentError } from '../shared/errors.js';
import { registerStartDaemon } from './commands/start-daemon.command.js';
import { registerKillDaemon } from './commands/kill-daemon.command.js';
import { registerConnect } from './commands/connect.command.js';
import { registerCloseApp } from './commands/close-app.command.js';
import { registerFindElement } from './commands/find-element.command.js';
import { registerClick } from './commands/click.command.js';
import { registerType } from './commands/type.command.js';
import { registerPageSource } from './commands/page-source.command.js';
import { registerReconnect } from './commands/reconnect.command.js';
import { registerActivateApp } from './commands/activate-app.command.js';
import { registerTerminateApp } from './commands/terminate-app.command.js';
import { registerTakeScreenshot } from './commands/take-screenshot.command.js';

const program = new Command();

program
  .name('appium-agent')
  .description('Appium daemon CLI — persistent session management for mobile automation')
  .version('0.1.0');

registerStartDaemon(program);
registerKillDaemon(program);
registerConnect(program);
registerCloseApp(program);
registerFindElement(program);
registerClick(program);
registerType(program);
registerPageSource(program);
registerReconnect(program);
registerActivateApp(program);
registerTerminateApp(program);
registerTakeScreenshot(program);

// Global error handler
async function run() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof DaemonNotRunningError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof AppiumAgentError) {
      console.error(`Error [${err.code}]: ${err.message}`);
      process.exit(1);
    }
    if (err instanceof Error) {
      // Check for daemon HTTP errors forwarded as plain errors with .code
      const code = (err as NodeJS.ErrnoException).code;
      if (typeof code === 'string') {
        console.error(`Error [${code}]: ${err.message}`);
      } else {
        console.error(`Error: ${err.message}`);
      }
      process.exit(1);
    }
    throw err;
  }
}

run();
