import pino from 'pino';

export function createLogger(name: string) {
  const level = process.env['LOG_LEVEL'] ?? 'info';
  const isProd = process.env['NODE_ENV'] === 'production';

  // The detached daemon has its stdout redirected to a log file, so only
  // colorize when a human is actually watching a terminal.
  if (isProd) {
    return pino({ name, level });
  }

  return pino(
    { name, level },
    pino.transport({
      target: 'pino-pretty',
      options: { colorize: process.stdout.isTTY === true },
    }),
  );
}

export type Logger = ReturnType<typeof createLogger>;
