// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use Node.js environment for testing
    environment: 'node',

    // Global test setup file
    setupFiles: ['./src/__tests__/setup.ts'],

    // Test file patterns
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'out', 'dist', '.vscode-test'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'out/**',
        'dist/**',
        'src/__tests__/**',
        '**/*.test.ts',
        '**/*.d.ts',
        'esbuild.js',
        'scripts/**',
      ],
      // Global and critical per-file coverage floors.
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 85,
        statements: 90,
        'src/dap/Client.ts': {
          perFile: { lines: 95, functions: 100, branches: 85, statements: 95 },
        },
        'src/routing/ToolRouter.ts': {
          perFile: { lines: 95, functions: 100, branches: 95, statements: 95 },
        },
        'src/security/ExpressionValidator.ts': {
          perFile: { lines: 95, functions: 95, branches: 90, statements: 95 },
        },
        'src/MCPServer.ts': {
          perFile: { lines: 85, functions: 90, branches: 75, statements: 85 },
        },
        'src/extension.ts': {
          perFile: { lines: 75, functions: 70, branches: 55, statements: 75 },
        },
        'src/routing/CompletionProvider.ts': {
          perFile: { lines: 70, functions: 65, branches: 60, statements: 70 },
        },
      },
    },

    // Reporter configuration
    reporters: ['verbose'],

    // Test timeout
    testTimeout: 10000,

    // Mock reset behavior
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },

  resolve: {
    alias: {
      // Alias for easier imports in tests
      '@': import.meta.dirname + '/src',
    },
  },
});
