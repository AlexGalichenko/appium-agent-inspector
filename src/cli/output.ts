import type { Command } from 'commander';

export interface Output {
  isJson(): boolean;
  /**
   * Prints `data` as JSON under `--json`, otherwise runs the human renderer.
   * Keeping both in one call site stops the two formats drifting apart.
   */
  emit(data: unknown, human: () => void): void;
}

/**
 * Indentation is for a human skimming a terminal. When the stream is a pipe the
 * only reader is a program or an agent, and every space it adds is context an
 * agent pays for.
 */
export function formatJson(
  data: unknown,
  stream: { isTTY?: boolean } = process.stdout,
): string {
  return stream.isTTY === true ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

export function makeOutput(program: Command): Output {
  const isJson = () => program.opts()['json'] === true;
  return {
    isJson,
    emit(data, human) {
      if (isJson()) {
        console.log(formatJson(data));
      } else {
        human();
      }
    },
  };
}
