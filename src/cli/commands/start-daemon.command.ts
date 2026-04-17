import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { Command } from 'commander';
import { DaemonClient } from '../daemon-client.js';
import { isDaemonProcessAlive, readDaemonState } from '../../daemon/pid-file.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ENTRY = join(__dirname, '..', '..', '..', 'dist', 'daemon', 'index.js');

export function registerStartDaemon(program: Command): void {
  program
    .command('daemon:start')
    .description('Start the Appium daemon server in the background')
    .option('--foreground', 'Run daemon in the foreground (non-detached)', false)
    .action(async (opts: { foreground: boolean }) => {
      // Check if already running
      const existing = await readDaemonState();
      if (existing !== null && isDaemonProcessAlive(existing.pid)) {
        console.log(`Daemon already running (pid: ${existing.pid}, port: ${existing.port})`);
        return;
      }

      if (opts.foreground) {
        // Run in foreground using tsx for dev convenience
        const proc = spawn('node', [DAEMON_ENTRY], {
          stdio: 'inherit',
          env: process.env,
        });
        proc.on('exit', (code) => process.exit(code ?? 0));
        return;
      }

      // Detached background mode
      const proc = spawn('node', [DAEMON_ENTRY], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      proc.unref();

      // Wait for daemon to become healthy (up to 10s)
      const client = DaemonClient.default();
      const timeout = Date.now() + 10_000;
      let healthy = false;
      while (Date.now() < timeout) {
        await new Promise((r) => setTimeout(r, 300));
        healthy = await client.healthCheck();
        if (healthy) break;
      }

      if (healthy) {
        console.log(`Daemon started (pid: ${proc.pid})`);
      } else {
        console.error('Daemon did not become healthy within 10s. Check logs.');
        process.exit(1);
      }
    });
}
