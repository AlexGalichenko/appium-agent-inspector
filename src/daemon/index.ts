#!/usr/bin/env node
import { DAEMON_HOST, DAEMON_PORT } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { SessionManager } from './session-manager.js';
import { ElementRegistry } from './element-registry.js';
import { buildServer } from './server.js';
import { removeDaemonState, writeDaemonState } from './pid-file.js';

const logger = createLogger('daemon');

async function main() {
  const sessionManager = new SessionManager(logger);
  const elementRegistry = new ElementRegistry();

  const server = await buildServer({ sessionManager, elementRegistry, logger });

  // Graceful shutdown handler
  async function shutdown(signal: string) {
    logger.info({ signal }, 'Received shutdown signal');
    try {
      if (sessionManager.isActive()) {
        logger.info('Closing active Appium session');
        await sessionManager.endSession();
      }
      await server.close();
      await removeDaemonState();
      logger.info('Daemon stopped cleanly');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Start listening
  await server.listen({ host: DAEMON_HOST, port: DAEMON_PORT });

  // Write PID file after successful bind
  await writeDaemonState({
    pid: process.pid,
    port: DAEMON_PORT,
    startedAt: new Date().toISOString(),
  });

  logger.info(
    { host: DAEMON_HOST, port: DAEMON_PORT, pid: process.pid },
    'Appium daemon started',
  );
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start daemon');
  process.exit(1);
});
