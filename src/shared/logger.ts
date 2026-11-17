import pino from 'pino';

/**
 * Plain JSON lines. The daemon runs detached with stdout redirected to its log
 * file, where a pretty-printing worker thread only adds a dependency and can
 * lose the final lines when the process is forced to exit. For a readable
 * view, pipe the file through `npx pino-pretty`.
 */
export function createLogger(name: string) {
  return pino({ name, level: process.env['LOG_LEVEL'] ?? 'info' });
}

export type Logger = ReturnType<typeof createLogger>;
