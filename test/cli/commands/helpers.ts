import { Command } from 'commander';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { DaemonClient } from '../../../src/cli/daemon-client.js';

/**
 * Test harness for CLI commands.
 *
 * Commands are registered against a real commander program, so option parsing,
 * defaults and `--json` routing are exercised exactly as they are in
 * `src/cli/index.ts`. Only the daemon boundary is faked.
 *
 * The file declaring `vi.mock('../../../src/cli/daemon-client.js')` and this
 * module share one mocked instance, so `useClient` works from here.
 */

export type Registrar = (program: Command) => void;

/** Installs the object `DaemonClient.fromDaemonState()` will hand the command. */
export function useClient(stub: Record<string, unknown>): void {
  vi.mocked(DaemonClient.fromDaemonState).mockResolvedValue(stub as never);
}

/** Makes `DaemonClient.fromDaemonState()` fail, as it does with no daemon up. */
export function useNoDaemon(error: Error): void {
  vi.mocked(DaemonClient.fromDaemonState).mockRejectedValue(error);
}

/** A spy resolving to `value`, for building client stubs. */
export function resolves(value?: unknown): Mock {
  return vi.fn().mockResolvedValue(value);
}

/**
 * Runs `argv` through a program carrying just this command, returning whatever
 * it wrote to stdout. `--json` is declared on the program exactly as the real
 * entry point declares it, since `makeOutput` reads it from there.
 */
export async function runCommand(register: Registrar, argv: string[]): Promise<string[]> {
  const logged: string[] = [];
  const spy = vi
    .spyOn(console, 'log')
    .mockImplementation((...args: unknown[]) =>
      logged.push(args.map((a) => String(a)).join(' ')),
    );

  try {
    const program = new Command();
    program.exitOverride();
    // exitOverride turns a bad invocation into a rejection the test asserts on,
    // so commander's own stderr report is just noise in the run output.
    program.configureOutput({ writeErr: () => {} });
    program.option('--json', 'Print machine-readable JSON instead of human text', false);
    register(program);
    await program.parseAsync(['node', 'appium-agent', ...argv]);
  } finally {
    spy.mockRestore();
  }

  return logged;
}

/** Runs a command under `--json` and parses the object it printed. */
export async function runJson<T = Record<string, unknown>>(
  register: Registrar,
  argv: string[],
): Promise<T> {
  const lines = await runCommand(register, ['--json', ...argv]);
  return JSON.parse(lines.join('\n')) as T;
}

/** The single argument a stubbed client method was called with. */
export function firstArg<T = Record<string, unknown>>(spy: unknown): T {
  return vi.mocked(spy as (...a: unknown[]) => unknown).mock.calls[0]![0] as T;
}
