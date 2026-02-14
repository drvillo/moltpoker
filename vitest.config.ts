import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts', '**/index.ts'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@moltpoker/shared': resolve(__dirname, 'packages/shared/src'),
      '@moltpoker/poker': resolve(__dirname, 'packages/poker/src'),
      '@moltpoker/sdk': resolve(__dirname, 'packages/sdk/src'),
      '@moltpoker/agents': resolve(__dirname, 'packages/agents/src'),
      '@moltpoker/simulator': resolve(__dirname, 'packages/simulator/src'),
    },
  },
});
