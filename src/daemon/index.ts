#!/usr/bin/env node
import { nanoid } from 'nanoid';
import {
  DAEMON_HOST,
  DAEMON_LOG_FILE,
  DEFAULT_DAEMON_PORT,
} from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { SessionManager } from './session-manager.js';
import { ElementRegistry } from './element-registry.js';
import { buildServer } from './server.js';
import { removeDaemonStateIfOwnedBy, writeDaemonState } from '../shared/state-file.js';

const logger = createLogger('daemon');

/** Number of ports to try past the requested one before giving up. */
const PORT_SCAN_RANGE = 20;

function isAddressInUse(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'EADDRINUSE';
}

async function listenWithFallback(
  server: Awaited<ReturnType<typeof buildServer>>,
  requestedPort: number,
  allowFallback: boolean,
): Promise<number> {
  const lastPort = allowFallback ? requestedPort + PORT_SCAN_RANGE : requestedPort;

  for (let port = requestedPort; port <= lastPort; port++) {
    try {
      await server.listen({ host: DAEMON_HOST, port });
      return port;
    } catch (err) {
      if (!isAddressInUse(err)) throw err;
      logger.warn({ port }, 'Port in use, trying the next one');
    }
  }

  throw new Error(
    `No free port in range ${requestedPort}-${lastPort}. Free one, or pass --port.`,
  );
}

function parseArgs(argv: string[]): { port: number; fixedPort: boolean } {
  const portIdx = argv.indexOf('--port');
  if (portIdx !== -1 && argv[portIdx + 1] !== undefined) {
    const port = Number(argv[portIdx + 1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid --port value: ${argv[portIdx + 1]}`);
    }
    return { port, fixedPort: true };
  }
  return { port: DEFAULT_DAEMON_PORT, fixedPort: false };
}

async function main() {
  const { port: requestedPort, fixedPort } = parseArgs(process.argv.slice(2));

  const sessionManager = new SessionManager(logger);
  const elementRegistry = new ElementRegistry();

  // Stored element references are only meaningful within a session.
  sessionManager.setSessionLostHandler(() => elementRegistry.invalidateAll());

  const token = process.env['APPIUM_AGENT_TOKEN'] ?? nanoid(32);
  const server = await buildServer({ sessionManager, elementRegistry, logger, token });

  // Graceful shutdown handler
  async function shutdown(signal: string) {
    logger.info({ signal }, 'Received shutdown signal');
    try {
      if (sessionManager.isActive()) {
        logger.info('Closing active Appium session');
        await sessionManager.endSession();
      }
      await server.close();
      await removeDaemonStateIfOwnedBy(process.pid);
      logger.info('Daemon stopped cleanly');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  const port = await listenWithFallback(server, requestedPort, !fixedPort);

  // Write state after a successful bind so the recorded port is the real one.
  await writeDaemonState({
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
    token,
    logFile: DAEMON_LOG_FILE,
  });

  logger.info({ host: DAEMON_HOST, port, pid: process.pid }, 'Appium daemon started');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start daemon');
  process.exit(1);
});
