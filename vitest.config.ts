import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/test/*.test.ts', 'apps/**/test/*.test.ts'],
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
      '@moltpoker/shared': '/workspace/packages/shared/src',
      '@moltpoker/poker': '/workspace/packages/poker/src',
      '@moltpoker/sdk': '/workspace/packages/sdk/src',
    },
  },
});
