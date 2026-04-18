import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // V050-006: integration tests live in tests/integration and opt into
    // jsdom via `// @vitest-environment jsdom` at the top of the file
    // (.tsx). Default stays `node` so the existing pure-function tests
    // under tests/lib/ run unchanged with zero per-file env switching cost.
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    setupFiles: ['./tests/setup/jest-dom.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
