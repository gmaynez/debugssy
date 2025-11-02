// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Use Node.js environment for testing
    environment: "node",

    // Global test setup file
    setupFiles: ["./src/__tests__/setup.ts"],

    // Test file patterns
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "out", "dist", ".vscode-test"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/**",
        "out/**",
        "dist/**",
        "src/__tests__/**",
        "**/*.test.ts",
        "**/*.d.ts",
        "esbuild.js",
        "scripts/**",
      ],
      // Target coverage thresholds
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },

    // Reporter configuration
    reporters: ["verbose"],

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
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
