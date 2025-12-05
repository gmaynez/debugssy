// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { vi } from 'vitest';

/**
 * Mock VS Code API for testing.
 * Provides commonly used VS Code types and functions.
 */

// Event Emitter mock
export class MockEventEmitter<T> {
  private listeners: Array<(e: T) => any> = [];

  event = (listener: (e: T) => any) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      },
    };
  };

  fire(data: T) {
    this.listeners.forEach((listener) => listener(data));
  }

  dispose() {
    this.listeners = [];
  }
}

// Disposable mock
export const mockDisposable = () => ({
  dispose: vi.fn(),
});

// Uri mock
export class MockUri {
  constructor(
    public scheme: string,
    public authority: string,
    public path: string,
    public query: string,
    public fragment: string,
    public fsPath: string
  ) {}

  static file(path: string) {
    return new MockUri('file', '', path, '', '', path);
  }

  static parse(value: string) {
    return new MockUri('file', '', value, '', '', value);
  }

  toString() {
    return this.fsPath;
  }
}

// Position mock
export class MockPosition {
  constructor(
    public line: number,
    public character: number
  ) {}
}

// Range mock
export class MockRange {
  constructor(
    public start: MockPosition,
    public end: MockPosition
  ) {}
}

// Location mock
export class MockLocation {
  constructor(
    public uri: MockUri,
    public range: MockRange
  ) {}
}

// SourceBreakpoint mock
export class MockSourceBreakpoint {
  public id: string;

  constructor(
    public location: MockLocation,
    public enabled: boolean = true,
    public condition?: string,
    public hitCondition?: string,
    public logMessage?: string
  ) {
    this.id = Math.random().toString(36).substring(7);
  }
}

// Debug Session mock
export const createMockDebugSession = (name: string = 'test-session', type: string = 'node') =>
  ({
    id: Math.random().toString(36).substring(7),
    name,
    type,
    workspaceFolder: undefined,
    configuration: {
      type,
      name,
      request: 'launch',
    },
    customRequest: vi.fn(),
    getDebugProtocolBreakpoint: vi.fn(),
  }) as any;

// Debug API mock
export const createMockDebugAPI = () => ({
  activeDebugSession: undefined as any,
  breakpoints: [] as any[],
  onDidStartDebugSession: vi.fn(() => mockDisposable()),
  onDidTerminateDebugSession: vi.fn(() => mockDisposable()),
  onDidChangeActiveDebugSession: vi.fn(() => mockDisposable()),
  onDidChangeBreakpoints: vi.fn(() => mockDisposable()),
  addBreakpoints: vi.fn((breakpoints: any[]) => {
    createMockDebugAPI().breakpoints.push(...breakpoints);
  }),
  removeBreakpoints: vi.fn((breakpoints: any[]) => {
    const mockDebug = createMockDebugAPI();
    mockDebug.breakpoints = mockDebug.breakpoints.filter((bp) => !breakpoints.includes(bp));
  }),
  registerDebugAdapterTrackerFactory: vi.fn(() => mockDisposable()),
  startDebugging: vi.fn(),
  stopDebugging: vi.fn(),
});

// Workspace API mock
export const createMockWorkspaceAPI = () => ({
  workspaceFolders: [] as any[],
  getConfiguration: vi.fn((_section?: string) => ({
    get: vi.fn((_key: string, defaultValue?: any) => defaultValue),
    has: vi.fn(() => true),
    inspect: vi.fn(),
    update: vi.fn(),
  })),
  onDidChangeConfiguration: vi.fn(() => mockDisposable()),
  onDidChangeWorkspaceFolders: vi.fn(() => mockDisposable()),
  fs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    delete: vi.fn(),
    createDirectory: vi.fn(),
  },
});

// Window API mock
export const createMockWindowAPI = () => ({
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  createOutputChannel: vi.fn(() => ({
    append: vi.fn(),
    appendLine: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  withProgress: vi.fn((_options, task) => task({ report: vi.fn() })),
});

// Commands API mock
export const createMockCommandsAPI = () => ({
  executeCommand: vi.fn(),
  registerCommand: vi.fn(() => mockDisposable()),
  registerTextEditorCommand: vi.fn(() => mockDisposable()),
  getCommands: vi.fn(() => Promise.resolve([])),
});

/**
 * Creates a complete VS Code API mock for testing
 */
export function createVSCodeMock() {
  const debug = createMockDebugAPI();
  const workspace = createMockWorkspaceAPI();
  const window = createMockWindowAPI();
  const commands = createMockCommandsAPI();

  return {
    // APIs
    debug,
    workspace,
    window,
    commands,

    // Classes
    Uri: MockUri,
    Position: MockPosition,
    Range: MockRange,
    Location: MockLocation,
    SourceBreakpoint: MockSourceBreakpoint,
    EventEmitter: MockEventEmitter,

    // Enums
    ProgressLocation: {
      Notification: 15,
      SourceControl: 1,
      Window: 10,
    },

    // Types
    Disposable: {
      from: (...disposables: any[]) => ({
        dispose: () => disposables.forEach((d) => d.dispose()),
      }),
    },
  };
}

/**
 * Helper to reset all mocks in the VS Code API
 */
export function resetVSCodeMocks(vscode: ReturnType<typeof createVSCodeMock>) {
  vi.clearAllMocks();
  vscode.debug.breakpoints = [];
  vscode.debug.activeDebugSession = undefined;
}
