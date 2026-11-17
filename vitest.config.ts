import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Commands persist state (the daemon record, the last screen for --diff).
    // No test may ever read or write the developer's real ~/.appium-agent.
    env: { APPIUM_AGENT_HOME: join(tmpdir(), `appium-agent-vitest-${process.pid}`) },
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points are process wiring (signal handlers, listen, spawn); they
      // are exercised by the manual smoke test rather than unit tests.
      exclude: ['src/cli/index.ts', 'src/daemon/index.ts'],
      reporter: ['text', 'html'],
      // A floor, not a target: set just under the current numbers so a real
      // regression fails the build without every small refactor tripping it.
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 88,
        lines: 92,
      },
    },
  },
});
