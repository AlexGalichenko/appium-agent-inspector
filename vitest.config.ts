import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry points are process wiring (signal handlers, listen, spawn); they
      // are exercised by the manual smoke test rather than unit tests.
      exclude: ['src/cli/index.ts', 'src/daemon/index.ts'],
      reporter: ['text', 'html'],
    },
  },
});
