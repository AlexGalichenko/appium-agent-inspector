import type { Command } from 'commander';

export interface Output {
  isJson(): boolean;
  /**
   * Prints `data` as JSON under `--json`, otherwise runs the human renderer.
   * Keeping both in one call site stops the two formats drifting apart.
   */
  emit(data: unknown, human: () => void): void;
}

export function makeOutput(program: Command): Output {
  const isJson = () => program.opts()['json'] === true;
  return {
    isJson,
    emit(data, human) {
      if (isJson()) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        human();
      }
    },
  };
}
