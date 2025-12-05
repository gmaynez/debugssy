// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { vi, beforeEach } from 'vitest';
import { createVSCodeMock, resetVSCodeMocks } from './helpers/vscode-mock';

/**
 * Global test setup for all test files.
 * Mocks the VS Code API and provides common test utilities.
 */

// Create and export the VS Code mock
export const vscode = createVSCodeMock();

// Mock the 'vscode' module globally
vi.mock('vscode', () => vscode);

// Mock the Logger singleton to avoid VS Code dependency
vi.mock('../utils/Logger', () => ({
  Logger: {
    getInstance: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      dispose: vi.fn(),
    }),
  },
}));

// Reset all mocks before each test
beforeEach(() => {
  resetVSCodeMocks(vscode);
  vi.clearAllMocks();
});
