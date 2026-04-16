// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { vi } from 'vitest';
import { MockUri, MockPosition, MockLocation } from './vscode-mock';
import type { ToolRegistry } from '../../tools';

/**
 * Common test fixtures and helper functions
 */

/**
 * Creates a mock file path for testing
 */
export function createTestFilePath(fileName: string = 'test.js'): string {
  return `/test/project/${fileName}`;
}

/**
 * Creates a mock breakpoint location
 */
export function createBreakpointLocation(filePath: string, line: number): MockLocation {
  const uri = MockUri.file(filePath);
  const position = new MockPosition(line - 1, 0);
  const range = new (class {
    start = position;
    end = position;
  })();
  return new MockLocation(uri, range as any);
}

/**
 * Creates a mock stack frame
 */
export function createMockStackFrame(
  id: number,
  name: string,
  filePath?: string,
  line: number = 1
) {
  return {
    id,
    name,
    source: filePath
      ? {
          path: filePath,
          name: filePath.split('/').pop(),
        }
      : undefined,
    line,
    column: 0,
  };
}

/**
 * Creates a mock variable
 */
export function createMockVariable(
  name: string,
  value: string,
  type?: string,
  variablesReference: number = 0
) {
  return {
    name,
    value,
    type,
    variablesReference,
  };
}

/**
 * Creates a mock scope
 */
export function createMockScope(
  name: string,
  variablesReference: number,
  expensive: boolean = false
) {
  return {
    name,
    variablesReference,
    expensive,
  };
}

/**
 * Creates a mock DAP message
 */
export function createDAPMessage(type: string, event?: string, body?: any) {
  return {
    type,
    event,
    body,
    seq: Math.floor(Math.random() * 1000),
  };
}

/**
 * Creates a mock Express request
 */
export function createMockRequest(
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    url?: string;
  } = {}
) {
  return {
    method: options.method || 'POST',
    headers: options.headers || {},
    body: options.body || {},
    url: options.url || '/mcp',
  } as any;
}

/**
 * Creates a mock Express response
 */
export function createMockResponse() {
  const res: any = {
    status: function (code: number) {
      res.statusCode = code;
      return res;
    },
    json: function (data: any) {
      res.jsonData = data;
      return res;
    },
    send: function (data: any) {
      res.sendData = data;
      return res;
    },
    setHeader: function (name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
    headersSent: false,
    statusCode: 200,
    jsonData: null,
    sendData: null,
    headers: {} as Record<string, string>,
  };
  return res;
}

/**
 * Creates a mock Express next function
 */
export function createMockNext() {
  return vi.fn();
}

/**
 * Wait for a promise to resolve with timeout
 */
export function waitFor(condition: () => boolean, timeout: number = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error('Timeout waiting for condition'));
      }
    }, 10);
  });
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assertion helper for checking if an object matches a pattern
 */
export function assertMatches<T>(actual: T, expected: Partial<T>, message?: string) {
  const errors: string[] = [];

  for (const key in expected) {
    if (actual[key] !== expected[key]) {
      errors.push(`Expected ${String(key)} to be ${expected[key]}, but got ${actual[key]}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`${message || 'Assertion failed'}:\n${errors.join('\n')}`);
  }
}

/**
 * Creates a mock ToolRegistry for testing MCPServer
 */
export function createMockToolRegistry(): ToolRegistry {
  return {
    debugControl: {
      startDebugging: vi.fn(),
      stopDebugging: vi.fn(),
      continueExecution: vi.fn(),
      pause: vi.fn(),
      restart: vi.fn(),
      stepOver: vi.fn(),
      stepInto: vi.fn(),
      stepOut: vi.fn(),
    } as any,
    breakpoints: {
      setBreakpoint: vi.fn(),
      removeBreakpoint: vi.fn(),
      listBreakpoints: vi.fn(),
      toggleBreakpoint: vi.fn(),
      removeAllBreakpoints: vi.fn(),
    } as any,
    inspection: {
      getVariables: vi.fn(),
      getCallStack: vi.fn(),
      evaluateExpression: vi.fn(),
      getThreads: vi.fn(),
      getDebugState: vi.fn(),
      getConsoleOutput: vi.fn(),
      clearConsoleOutput: vi.fn(),
      waitForBreakpoint: vi.fn(),
    } as any,
    dispose: vi.fn(),
  };
}
