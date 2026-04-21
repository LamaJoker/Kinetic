import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    exclude: ['tests/e2e/**'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'tests/coverage',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      include: [
        'packages/core/src/**/*.ts',
        'packages/adapter-web/src/**/*.ts',
        'apps/web/src/lib/**/*.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/index.ts',
        '**/*.types.ts',
        '**/database.types.ts',
      ],
    },
    reporters: ['verbose'],
    testTimeout: 10000,
    hookTimeout: 5000,
    globals: true,
  },

  resolve: {
    alias: {
      '@kinetic/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@kinetic/adapters-web': resolve(__dirname, 'packages/adapter-web/src/index.ts'),
    },
  },
});